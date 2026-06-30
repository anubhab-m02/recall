import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LanceDbStore } from "../../src/storage/lancedb.js";
import type { MemoryEvent } from "@recall/shared-types";

function makeEvent(overrides: Partial<MemoryEvent> = {}): MemoryEvent {
  return {
    id: "evt-1",
    schemaVersion: 1,
    rev: 1,
    tenantId: "local",
    deviceId: "device-1",
    source: "vscode",
    type: "terminal_command",
    occurredAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    payload: { command: "npm test", cwd: "/repo", exitCode: 0, outputExcerpt: "ok" },
    embeddingText: "terminal_command | exit=0 | npm test",
    tags: ["npm"],
    links: [],
    redacted: false,
    privacy: { pinned: false, excludedFromSync: false },
    ...overrides
  };
}

describe("LanceDbStore", () => {
  let dir: string;
  let store: LanceDbStore;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "recall-lancedb-"));
    store = await LanceDbStore.open(dir);
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("starts with no events after schema seeding", async () => {
    expect(await store.countEvents()).toBe(0);
  });

  it("round-trips a MemoryEvent by id", async () => {
    const event = makeEvent();
    await store.insertEvent(event);

    const fetched = await store.getEventById("evt-1");
    expect(fetched).toEqual(event);
    expect(await store.countEvents()).toBe(1);
  });

  it("returns undefined for an id that was never inserted", async () => {
    expect(await store.getEventById("does-not-exist")).toBeUndefined();
  });

  it("deletes an event so it is unrecoverable (spec SEC-7)", async () => {
    await store.insertEvent(makeEvent());
    await store.deleteEvent("evt-1");
    expect(await store.getEventById("evt-1")).toBeUndefined();
    expect(await store.countEvents()).toBe(0);
  });

  it("lists events scoped to a tenant", async () => {
    await store.insertEvent(makeEvent({ id: "evt-1", tenantId: "local" }));
    await store.insertEvent(makeEvent({ id: "evt-2", tenantId: "other-tenant" }));

    const localEvents = await store.listEventsByTenant("local");
    expect(localEvents.map((e) => e.id)).toEqual(["evt-1"]);
  });

  it("round-trips a Lesson by id", async () => {
    const lesson = {
      id: "lesson-1",
      schemaVersion: 1,
      rev: 1,
      tenantId: "local",
      title: "Flaky test fix",
      summary: "Async teardown leak resolved by awaiting handle close.",
      sourceEventIds: ["evt-1"],
      tags: ["jest"],
      embedding: [0.1, 0.2, 0.3],
      embeddingModel: "all-MiniLM-L6-v2",
      embeddingDim: 3,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      usefulnessScore: 0
    };
    await store.insertLesson(lesson);
    expect(await store.getLessonById("lesson-1")).toEqual(lesson);
  });
});
