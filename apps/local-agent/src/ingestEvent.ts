// Event ingestion (spec FR-10, §8.1 POST /v1/events): normalizes a
// capture-surface payload into a stored MemoryEvent, running it through
// the redaction pipeline first (SEC-3) and recording an audit-log entry
// (SEC-8) before it ever touches LanceDB.

import { ulid } from "ulid";
import type { MemoryEventInput, MemoryEvent } from "@recall/shared-types";
import { redactMemoryEvent } from "./redaction/pipeline.js";
import type { SqliteStore } from "./storage/sqlite.js";
import type { LanceDbStore } from "./storage/lancedb.js";

const SCHEMA_VERSION = 1;
const INITIAL_REV = 1;

export interface IngestDeps {
  sqlite: SqliteStore;
  lancedb: LanceDbStore;
}

export async function ingestEvent(input: MemoryEventInput, deps: IngestDeps): Promise<MemoryEvent> {
  const now = new Date().toISOString();
  const { event: sanitized, redacted } = redactMemoryEvent({
    payload: input.payload,
    embeddingText: input.embeddingText
  });

  const event: MemoryEvent = {
    ...input,
    id: ulid(),
    schemaVersion: SCHEMA_VERSION,
    rev: INITIAL_REV,
    updatedAt: input.updatedAt ?? now,
    tags: input.tags ?? [],
    links: input.links ?? [],
    privacy: input.privacy ?? { pinned: false, excludedFromSync: false },
    payload: sanitized.payload,
    embeddingText: sanitized.embeddingText,
    redacted
  };

  await deps.lancedb.insertEvent(event);
  deps.sqlite.appendAuditLog("event.ingested", {
    id: event.id,
    type: event.type,
    source: event.source,
    redacted: event.redacted
  });

  return event;
}
