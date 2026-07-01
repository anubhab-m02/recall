import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MemoryEvent } from "@recall/shared-types";
import { runStandupJobIfMissing, runWeeklyJobIfMissing } from "../../src/jobs/scheduler.js";
import { currentWeekOf, yesterdayDate } from "../../src/jobs/dateRange.js";
import { LanceDbStore } from "../../src/storage/lancedb.js";
import { SqliteStore } from "../../src/storage/sqlite.js";
import { FakeEmbeddingProvider } from "../helpers/fakeEmbeddingProvider.js";
import { FakeGenerationProvider } from "../helpers/fakeGenerationProvider.js";

function makeEvent(overrides: Partial<MemoryEvent> = {}): MemoryEvent {
  return {
    id: overrides.id ?? "evt-1",
    schemaVersion: 1,
    rev: 1,
    tenantId: "local",
    deviceId: "device-1",
    source: "vscode",
    type: "terminal_command",
    occurredAt: overrides.occurredAt ?? `${yesterdayDate()}T09:00:00.000Z`,
    updatedAt: "2026-07-01T00:00:00.000Z",
    payload: {},
    embeddingText: "terminal_command | npm test",
    tags: [],
    links: [],
    redacted: false,
    privacy: { pinned: false, excludedFromSync: false },
    ...overrides
  };
}

describe("scheduler job gating", () => {
  let dir: string;
  let lancedb: LanceDbStore;
  let sqlite: SqliteStore;
  const embeddings = new FakeEmbeddingProvider();
  const provider = new FakeGenerationProvider("draft");

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "recall-scheduler-"));
    lancedb = await LanceDbStore.open(dir);
    sqlite = new SqliteStore(":memory:");
  });

  afterEach(() => {
    lancedb.close();
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("runStandupJobIfMissing generates a standup when yesterday's is missing", async () => {
    await lancedb.insertEvent(makeEvent());
    await runStandupJobIfMissing({ tenantId: "local", lancedb, sqlite, provider, embeddings });

    expect(sqlite.getDailyStandupByDate(yesterdayDate())).toBeDefined();
  });

  it("runStandupJobIfMissing does not regenerate when one already exists", async () => {
    const date = yesterdayDate();
    sqlite.upsertDailyStandup({
      id: `standup-${date}`,
      date,
      generatedAt: "2026-07-01T00:00:00.000Z",
      draftText: "already generated",
      sourceEventIds: []
    });

    await runStandupJobIfMissing({ tenantId: "local", lancedb, sqlite, provider, embeddings });

    expect(sqlite.getDailyStandupByDate(date)?.draftText).toBe("already generated");
  });

  it("runWeeklyJobIfMissing generates a summary when this week's is missing", async () => {
    await runWeeklyJobIfMissing({ tenantId: "local", lancedb, sqlite, provider, embeddings });
    expect(sqlite.getWeeklySummaryByWeekOf(currentWeekOf())).toBeDefined();
  });

  it("runWeeklyJobIfMissing does not regenerate when one already exists", async () => {
    const weekOf = currentWeekOf();
    sqlite.upsertWeeklySummary({
      id: `weekly-${weekOf}`,
      weekOf,
      generatedAt: "2026-07-01T00:00:00.000Z",
      draftText: "already generated",
      highlightedLessonIds: []
    });

    await runWeeklyJobIfMissing({ tenantId: "local", lancedb, sqlite, provider, embeddings });

    expect(sqlite.getWeeklySummaryByWeekOf(weekOf)?.draftText).toBe("already generated");
  });
});
