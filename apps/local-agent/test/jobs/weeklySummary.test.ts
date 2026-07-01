import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Lesson } from "@recall/shared-types";
import { generateWeeklySummary } from "../../src/jobs/weeklySummary.js";
import { LanceDbStore } from "../../src/storage/lancedb.js";
import { SqliteStore } from "../../src/storage/sqlite.js";
import { FakeGenerationProvider } from "../helpers/fakeGenerationProvider.js";

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

describe("generateWeeklySummary", () => {
  let dir: string;
  let lancedb: LanceDbStore;
  let sqlite: SqliteStore;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "recall-weekly-"));
    lancedb = await LanceDbStore.open(dir);
    sqlite = new SqliteStore(":memory:");
  });

  afterEach(() => {
    lancedb.close();
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("synthesizes from the week's lessons and highlights them", async () => {
    await lancedb.insertLesson(
      makeLesson({ id: "lesson-in-week", createdAt: "2026-06-30T00:00:00.000Z" })
    );
    await lancedb.insertLesson(
      makeLesson({ id: "lesson-out-of-week", createdAt: "2026-07-10T00:00:00.000Z" })
    );

    const provider = new FakeGenerationProvider("Synthesized weekly narrative.");
    const summary = await generateWeeklySummary(
      "local",
      { lancedb, sqlite, provider },
      "2026-06-29"
    );

    expect(summary.weekOf).toBe("2026-06-29");
    expect(summary.draftText).toBe("Synthesized weekly narrative.");
    expect(summary.highlightedLessonIds).toEqual(["lesson-in-week"]);
  });

  it("falls back to the week's daily standups when there are no lessons yet", async () => {
    sqlite.upsertDailyStandup({
      id: "standup-2026-06-30",
      date: "2026-06-30",
      generatedAt: "2026-06-30T09:00:00.000Z",
      draftText: "Fixed the CI pipeline.",
      sourceEventIds: []
    });

    const provider = new FakeGenerationProvider((prompt) =>
      prompt.includes("Fixed the CI pipeline.") ? "used standups" : "missed it"
    );
    const summary = await generateWeeklySummary(
      "local",
      { lancedb, sqlite, provider },
      "2026-06-29"
    );

    expect(summary.draftText).toBe("used standups");
    expect(summary.highlightedLessonIds).toEqual([]);
  });

  it("still produces a non-empty draft for a week with no activity", async () => {
    const provider = new FakeGenerationProvider();
    const summary = await generateWeeklySummary(
      "local",
      { lancedb, sqlite, provider },
      "2026-06-29"
    );

    expect(summary.draftText).toBe("No activity captured this week.");
  });

  it("persists the summary so it can be refetched by weekOf", async () => {
    await lancedb.insertLesson(makeLesson({ createdAt: "2026-06-30T00:00:00.000Z" }));
    const provider = new FakeGenerationProvider("draft");
    await generateWeeklySummary("local", { lancedb, sqlite, provider }, "2026-06-29");

    expect(sqlite.getWeeklySummaryByWeekOf("2026-06-29")?.draftText).toBe("draft");
  });
});
