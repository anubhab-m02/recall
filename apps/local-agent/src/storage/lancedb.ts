// LanceDB storage layer (spec §7.5): MemoryEvent and Lesson records.
//
// Substitution note (spec §0.3 / §9): the spec names the `vectordb` npm
// package; that package is deprecated in favor of `@lancedb/lancedb`, the
// current official LanceDB JS SDK, used here instead.
//
// Phase 1 scope: durable insert/fetch/delete by id, with tenantId/type/
// occurredAt as filterable top-level columns. Rows store the full
// MemoryEvent/Lesson as a JSON blob rather than a native Arrow vector
// column — embeddings don't exist yet (embedding generation is Phase 3),
// and inferring a stable Arrow schema (notably avoiding BigInt round-trips
// for integer fields) from heterogeneous JS objects is exactly the kind of
// risk worth deferring until hybridSearch (Phase 3) needs real vector +
// FTS columns and can introduce them deliberately alongside an index.

import * as lancedb from "@lancedb/lancedb";
import type { Lesson, MemoryEvent } from "@recall/shared-types";

const EVENTS_TABLE = "memory_events";
const LESSONS_TABLE = "lessons";
const SEED_ROW_ID = "__schema_seed__";

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
  private constructor(private readonly connection: lancedb.Connection) {}

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

  async insertEvent(event: MemoryEvent): Promise<void> {
    const table = await this.connection.openTable(EVENTS_TABLE);
    await table.add([eventToRow(event) as unknown as Record<string, unknown>]);
  }

  async getEventById(id: string): Promise<MemoryEvent | undefined> {
    const table = await this.connection.openTable(EVENTS_TABLE);
    const rows = await table
      .query()
      .where(`id = '${escapeForFilter(id)}'`)
      .limit(1)
      .toArray();
    const row = rows[0] as EventRow | undefined;
    return row ? rowToEvent(row) : undefined;
  }

  async deleteEvent(id: string): Promise<void> {
    const table = await this.connection.openTable(EVENTS_TABLE);
    await table.delete(`id = '${escapeForFilter(id)}'`);
  }

  async countEvents(): Promise<number> {
    const table = await this.connection.openTable(EVENTS_TABLE);
    return table.countRows();
  }

  async listEventsByTenant(tenantId: string, limit = 100): Promise<MemoryEvent[]> {
    const table = await this.connection.openTable(EVENTS_TABLE);
    const rows = await table
      .query()
      .where(`tenantId = '${escapeForFilter(tenantId)}'`)
      .limit(limit)
      .toArray();
    return (rows as EventRow[]).map(rowToEvent);
  }

  // --- Lesson ---

  async insertLesson(lesson: Lesson): Promise<void> {
    const table = await this.connection.openTable(LESSONS_TABLE);
    await table.add([lessonToRow(lesson) as unknown as Record<string, unknown>]);
  }

  async getLessonById(id: string): Promise<Lesson | undefined> {
    const table = await this.connection.openTable(LESSONS_TABLE);
    const rows = await table
      .query()
      .where(`id = '${escapeForFilter(id)}'`)
      .limit(1)
      .toArray();
    const row = rows[0] as LessonRow | undefined;
    return row ? rowToLesson(row) : undefined;
  }

  async deleteLesson(id: string): Promise<void> {
    const table = await this.connection.openTable(LESSONS_TABLE);
    await table.delete(`id = '${escapeForFilter(id)}'`);
  }

  close(): void {
    this.connection.close();
  }
}
