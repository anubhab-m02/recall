import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Lesson, MemoryEvent } from "@recall/shared-types";
import { computeSkillProfile, generateSkillProfile } from "../../src/jobs/skillProfile.js";
import { LanceDbStore } from "../../src/storage/lancedb.js";
import { SqliteStore } from "../../src/storage/sqlite.js";

function makeEvent(overrides: Partial<MemoryEvent> = {}): MemoryEvent {
  return {
    id: overrides.id ?? "evt-1",
    schemaVersion: 1,
    rev: 1,
    tenantId: "local",
    deviceId: "device-1",
    source: "vscode",
    type: "terminal_command",
    occurredAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-01T09:00:00.000Z",
    payload: {},
    embeddingText: "terminal_command | npm test",
    tags: [],
    links: [],
    redacted: false,
    privacy: { pinned: false, excludedFromSync: false },
    ...overrides
  };
}

function makeLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: overrides.id ?? "lesson-1",
    schemaVersion: 1,
    rev: 1,
    tenantId: "local",
    title: "Flaky test fix",
    summary: "Async teardown leak resolved by awaiting handle close.",
    sourceEventIds: ["evt-1"],
    tags: [],
    embedding: [0.1, 0.2, 0.3],
    embeddingModel: "test-model",
    embeddingDim: 3,
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    usefulnessScore: 0,
    ...overrides
  };
}

describe("computeSkillProfile", () => {
  const now = new Date("2026-07-01T00:00:00.000Z");

  it("aggregates tag frequency, lastSeen, and language counts", () => {
    const events = [
      makeEvent({ id: "e1", tags: ["typescript"], context: { language: "typescript" } }),
      makeEvent({
        id: "e2",
        tags: ["typescript", "testing"],
        occurredAt: "2026-06-25T00:00:00.000Z",
        context: { language: "typescript" }
      })
    ];

    const profile = computeSkillProfile("local", events, [], now);

    expect(profile.tenantId).toBe("local");
    expect(profile.tagFrequencies["typescript"].count).toBe(2);
    expect(profile.tagFrequencies["typescript"].lastSeen).toBe("2026-07-01T09:00:00.000Z");
    expect(profile.tagFrequencies["testing"].count).toBe(1);
    expect(profile.topLanguages["typescript"]).toBe(2);
  });

  it("marks a tag trending up when recent activity outweighs the prior window", () => {
    const events = [
      makeEvent({ id: "recent-1", tags: ["rust"], occurredAt: "2026-06-30T00:00:00.000Z" }),
      makeEvent({ id: "recent-2", tags: ["rust"], occurredAt: "2026-06-29T00:00:00.000Z" }),
      makeEvent({ id: "old-1", tags: ["rust"], occurredAt: "2026-06-10T00:00:00.000Z" })
    ];

    const profile = computeSkillProfile("local", events, [], now);

    expect(profile.tagFrequencies["rust"].trend).toBe("up");
  });

  it("marks a tag trending down when the prior window outweighs recent activity", () => {
    const events = [
      makeEvent({ id: "recent-1", tags: ["go"], occurredAt: "2026-06-30T00:00:00.000Z" }),
      makeEvent({ id: "old-1", tags: ["go"], occurredAt: "2026-06-10T00:00:00.000Z" }),
      makeEvent({ id: "old-2", tags: ["go"], occurredAt: "2026-06-11T00:00:00.000Z" })
    ];

    const profile = computeSkillProfile("local", events, [], now);

    expect(profile.tagFrequencies["go"].trend).toBe("down");
  });

  it("counts distinct problem patterns resolved as the number of lessons", () => {
    const lessons = [makeLesson({ id: "l1" }), makeLesson({ id: "l2" })];

    const profile = computeSkillProfile("local", [], lessons, now);

    expect(profile.distinctProblemPatternsResolved).toBe(2);
  });
});

describe("generateSkillProfile", () => {
  let dir: string;
  let lancedb: LanceDbStore;
  let sqlite: SqliteStore;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "recall-skillprofile-"));
    lancedb = await LanceDbStore.open(dir);
    sqlite = new SqliteStore(":memory:");
  });

  afterEach(() => {
    lancedb.close();
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("computes from stored events/lessons and persists the result", async () => {
    await lancedb.insertEvent(makeEvent({ id: "evt-1", tags: ["typescript"] }));
    await lancedb.insertLesson(makeLesson({ id: "lesson-1" }));

    const now = new Date("2026-07-01T12:00:00.000Z");
    const profile = await generateSkillProfile("local", { lancedb, sqlite }, now);

    expect(profile.tagFrequencies["typescript"].count).toBe(1);
    expect(profile.distinctProblemPatternsResolved).toBe(1);
    expect(sqlite.getSkillProfile("local")).toEqual(profile);
  });
});
