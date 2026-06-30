// LanceDB storage layer (spec §7.5): MemoryEvent and Lesson records.
//
// Substitution note (spec §0.3 / §9): the spec names the `vectordb` npm
// package; that package is deprecated in favor of `@lancedb/lancedb`, the
// current official LanceDB JS SDK, used here instead.
//
// Rows store the full MemoryEvent/Lesson as a JSON blob rather than a
// native Arrow vector column, with tenantId/type/occurredAt as filterable
// top-level columns. This was a deliberate Phase 1 choice to avoid
// inferring a stable Arrow schema (notably BigInt round-trips for integer
// fields) before real embeddings existed. Phase 3 adds embeddings but
// keeps this representation: ranking now happens in JS (retrieval/
// hybridSearch.ts) over scanEventsForSearch's candidate set rather than
// via a native ANN index, which comfortably meets the spec's latency
// budget (§5A.1: P95 <300ms over 1,000 events) without the added
// complexity of a vector column + index. A native vector column remains
// the natural next step if/when corpora grow well past that scale.

import * as lancedb from "@lancedb/lancedb";
import type { Lesson, MemoryEvent } from "@recall/shared-types";

const EVENTS_TABLE = "memory_events";
const LESSONS_TABLE = "lessons";
const SEED_ROW_ID = "__schema_seed__";
const SCAN_LIMIT = 1000;

interface EventRow {
  id: string;
  tenantId: string;
  type: string;
  occurredAt: string;
  redacted: boolean;
  data: string;
}

interface LessonRow {
  id: string;
  tenantId: string;
  data: string;
}

function escapeForFilter(value: string): string {
  return value.replace(/'/g, "''");
}

// Reads occasionally hit a transient Lance I/O error when they race a
// concurrent commit (observed under the embedding queue's background
// writes) — a "manifest/object not found" error from reading a dataset
// version that was being superseded at that exact instant. This is an
// embedded-database equivalent of an eventual-consistency hiccup, not a
// logic bug: the very next read (microseconds later) succeeds. One short
// retry absorbs it rather than surfacing a spurious 500 to the caller.
async function withReadRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 25));
    return fn();
  }
}

function eventToRow(event: MemoryEvent): EventRow {
  return {
    id: event.id,
    tenantId: event.tenantId,
    type: event.type,
    occurredAt: event.occurredAt,
    redacted: event.redacted,
    data: JSON.stringify(event)
  };
}

function rowToEvent(row: EventRow): MemoryEvent {
  return JSON.parse(row.data) as MemoryEvent;
}

function lessonToRow(lesson: Lesson): LessonRow {
  return { id: lesson.id, tenantId: lesson.tenantId, data: JSON.stringify(lesson) };
}

function rowToLesson(row: LessonRow): Lesson {
  return JSON.parse(row.data) as Lesson;
}

const SEED_EVENT: MemoryEvent = {
  id: SEED_ROW_ID,
  schemaVersion: 1,
  rev: 1,
  tenantId: "local",
  deviceId: "seed",
  source: "manual",
  type: "manual_note",
  occurredAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  payload: {},
  embeddingText: "",
  tags: [],
  links: [],
  redacted: false,
  privacy: { pinned: false, excludedFromSync: false }
};

const SEED_LESSON: Lesson = {
  id: SEED_ROW_ID,
  schemaVersion: 1,
  rev: 1,
  tenantId: "local",
  title: "",
  summary: "",
  sourceEventIds: [],
  tags: [],
  embedding: [],
  embeddingModel: "none",
  embeddingDim: 0,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  usefulnessScore: 0
};

export class LanceDbStore {
  // Serializes mutations (insert/delete/update) on this connection. Lance's
  // versioned-commit model isn't safe under concurrent writers from a
  // single process the way a SQL transaction would be — e.g. the
  // background embedding queue's delete+reinsert racing a foreground
  // POST /v1/events insert can silently lose one of the two writes.
  // Reads aren't serialized; only mutations need this.
  private writeLock: Promise<unknown> = Promise.resolve();

  private constructor(private readonly connection: lancedb.Connection) {}

  private withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.writeLock.then(fn, fn);
    this.writeLock = result.catch(() => undefined);
    return result;
  }

  static async open(dbPath: string): Promise<LanceDbStore> {
    const connection = await lancedb.connect(dbPath);
    const store = new LanceDbStore(connection);
    await store.ensureTable(EVENTS_TABLE, [
      eventToRow(SEED_EVENT) as unknown as Record<string, unknown>
    ]);
    await store.ensureTable(LESSONS_TABLE, [
      lessonToRow(SEED_LESSON) as unknown as Record<string, unknown>
    ]);
    return store;
  }

  private async ensureTable(
    name: string,
    seedRows: Record<string, unknown>[]
  ): Promise<lancedb.Table> {
    const existing = await this.connection.tableNames();
    if (existing.includes(name)) {
      return this.connection.openTable(name);
    }
    const table = await this.connection.createTable(name, seedRows, {
      mode: "create",
      existOk: true
    });
    await table.delete(`id = '${SEED_ROW_ID}'`);
    return table;
  }

  // --- MemoryEvent ---

  private async insertEventUnlocked(event: MemoryEvent): Promise<void> {
    const table = await this.connection.openTable(EVENTS_TABLE);
    await table.add([eventToRow(event) as unknown as Record<string, unknown>]);
  }

  private async deleteEventUnlocked(id: string): Promise<void> {
    const table = await this.connection.openTable(EVENTS_TABLE);
    await table.delete(`id = '${escapeForFilter(id)}'`);
  }

  insertEvent(event: MemoryEvent): Promise<void> {
    return this.withWriteLock(() => this.insertEventUnlocked(event));
  }

  getEventById(id: string): Promise<MemoryEvent | undefined> {
    return withReadRetry(async () => {
      const table = await this.connection.openTable(EVENTS_TABLE);
      const rows = await table
        .query()
        .where(`id = '${escapeForFilter(id)}'`)
        .limit(1)
        .toArray();
      const row = rows[0] as EventRow | undefined;
      return row ? rowToEvent(row) : undefined;
    });
  }

  deleteEvent(id: string): Promise<void> {
    return this.withWriteLock(() => this.deleteEventUnlocked(id));
  }

  // Used by the embedding queue (spec §11.1) to populate embedding/
  // embeddingModel/embeddingDim once background embedding finishes for an
  // event that was already persisted without one.
  //
  // This MUST be a single atomic upsert (LanceDB's mergeInsert), not a
  // delete-then-reinsert pair: even serialized behind the write lock so no
  // other *write* can interleave, a delete+insert still leaves a window
  // where the row briefly doesn't exist at all, and reads (scanEventsForSearch,
  // getEventById) aren't — and shouldn't need to be — blocked by the write
  // lock. A concurrent search landing in that gap would silently miss the
  // event. mergeInsert has no such gap: the row is replaced in one commit.
  updateEvent(event: MemoryEvent): Promise<void> {
    return this.withWriteLock(async () => {
      const table = await this.connection.openTable(EVENTS_TABLE);
      await table
        .mergeInsert("id")
        .whenMatchedUpdateAll()
        .whenNotMatchedInsertAll()
        .execute([eventToRow(event) as unknown as Record<string, unknown>]);
    });
  }

  async countEvents(): Promise<number> {
    const table = await this.connection.openTable(EVENTS_TABLE);
    return table.countRows();
  }

  listEventsByTenant(tenantId: string, limit = 100): Promise<MemoryEvent[]> {
    return withReadRetry(async () => {
      const table = await this.connection.openTable(EVENTS_TABLE);
      const rows = await table
        .query()
        .where(`tenantId = '${escapeForFilter(tenantId)}'`)
        .limit(limit)
        .toArray();
      return (rows as EventRow[]).map(rowToEvent);
    });
  }

  // Candidate fetch backing hybridSearch.ts (spec §11.2): metadata-filtered
  // but deliberately *unranked* — vector/keyword/recency scoring is
  // hybridSearch's job, not the storage layer's. Capped at SCAN_LIMIT
  // candidates, which keeps this comfortably within the latency budget
  // (spec §5A.1) for the corpus sizes a v1 local install accumulates.
  scanEventsForSearch(options: {
    tenantId: string;
    type?: string;
    project?: string;
    since?: string;
  }): Promise<MemoryEvent[]> {
    return withReadRetry(async () => {
      const table = await this.connection.openTable(EVENTS_TABLE);
      const predicates = [`tenantId = '${escapeForFilter(options.tenantId)}'`];
      if (options.type) {
        predicates.push(`type = '${escapeForFilter(options.type)}'`);
      }
      const rows = await table.query().where(predicates.join(" AND ")).limit(SCAN_LIMIT).toArray();
      let events = (rows as EventRow[]).map(rowToEvent);

      if (options.since) {
        events = events.filter((event) => event.occurredAt >= options.since!);
      }
      if (options.project) {
        events = events.filter((event) => event.project?.repoRoot === options.project);
      }

      return events;
    });
  }

  // --- Lesson ---

  insertLesson(lesson: Lesson): Promise<void> {
    return this.withWriteLock(async () => {
      const table = await this.connection.openTable(LESSONS_TABLE);
      await table.add([lessonToRow(lesson) as unknown as Record<string, unknown>]);
    });
  }

  getLessonById(id: string): Promise<Lesson | undefined> {
    return withReadRetry(async () => {
      const table = await this.connection.openTable(LESSONS_TABLE);
      const rows = await table
        .query()
        .where(`id = '${escapeForFilter(id)}'`)
        .limit(1)
        .toArray();
      const row = rows[0] as LessonRow | undefined;
      return row ? rowToLesson(row) : undefined;
    });
  }

  deleteLesson(id: string): Promise<void> {
    return this.withWriteLock(async () => {
      const table = await this.connection.openTable(LESSONS_TABLE);
      await table.delete(`id = '${escapeForFilter(id)}'`);
    });
  }

  close(): void {
    this.connection.close();
  }
}
