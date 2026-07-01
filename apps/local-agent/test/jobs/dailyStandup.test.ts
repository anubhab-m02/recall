import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MemoryEvent } from "@recall/shared-types";
import { generateDailyStandup } from "../../src/jobs/dailyStandup.js";
import { LanceDbStore } from "../../src/storage/lancedb.js";
import { SqliteStore } from "../../src/storage/sqlite.js";
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

describe("generateDailyStandup", () => {
  let dir: string;
  let lancedb: LanceDbStore;
  let sqlite: SqliteStore;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "recall-standup-"));
    lancedb = await LanceDbStore.open(dir);
    sqlite = new SqliteStore(":memory:");
  });

  afterEach(() => {
    lancedb.close();
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("generates a standup from the target day's events only", async () => {
    await lancedb.insertEvent(makeEvent({ id: "evt-in", occurredAt: "2026-07-01T09:00:00.000Z" }));
    await lancedb.insertEvent(makeEvent({ id: "evt-out", occurredAt: "2026-07-02T09:00:00.000Z" }));

    const provider = new FakeGenerationProvider("Yesterday: fixed the flaky test.");
    const standup = await generateDailyStandup(
      "local",
      { lancedb, sqlite, provider },
      "2026-07-01"
    );

    expect(standup.date).toBe("2026-07-01");
    expect(standup.draftText).toBe("Yesterday: fixed the flaky test.");
    expect(standup.sourceEventIds).toEqual(["evt-in"]);
  });

  it("produces a usable draft with no LLM configured (extractive fallback, DoD)", async () => {
    await lancedb.insertEvent(
      makeEvent({ id: "evt-1", embeddingText: "terminal_command | exit=1 | jest timeout" })
    );

    const failingProvider = {
      name: "unavailable-llm",
      isAvailable: async () => false,
      generate: async () => {
        throw new Error("no model configured");
      }
    };
    const standup = await generateDailyStandup(
      "local",
      { lancedb, sqlite, provider: failingProvider },
      "2026-07-01"
    );

    expect(standup.draftText).toContain("jest timeout");
    expect(standup.draftText.length).toBeGreaterThan(0);
  });

  it("still produces a non-empty draft for a day with no events", async () => {
    const provider = new FakeGenerationProvider();
    const standup = await generateDailyStandup(
      "local",
      { lancedb, sqlite, provider },
      "2026-07-01"
    );

    expect(standup.draftText).toBe("No captured activity for this day.");
    expect(standup.sourceEventIds).toEqual([]);
  });

  it("persists the standup so it can be refetched by date", async () => {
    await lancedb.insertEvent(makeEvent());
    const provider = new FakeGenerationProvider("draft");
    await generateDailyStandup("local", { lancedb, sqlite, provider }, "2026-07-01");

    expect(sqlite.getDailyStandupByDate("2026-07-01")?.draftText).toBe("draft");
  });

  it("regenerating for the same date replaces the previous draft, not duplicates it", async () => {
    await lancedb.insertEvent(makeEvent());
    const provider1 = new FakeGenerationProvider("first draft");
    await generateDailyStandup("local", { lancedb, sqlite, provider: provider1 }, "2026-07-01");

    const provider2 = new FakeGenerationProvider("second draft");
    await generateDailyStandup("local", { lancedb, sqlite, provider: provider2 }, "2026-07-01");

    expect(sqlite.getDailyStandupByDate("2026-07-01")?.draftText).toBe("second draft");
  });
});
