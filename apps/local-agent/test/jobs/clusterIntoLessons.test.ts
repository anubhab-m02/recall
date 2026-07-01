import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MemoryEvent } from "@recall/shared-types";
import { clusterIntoLessons } from "../../src/jobs/clusterIntoLessons.js";
import { LanceDbStore } from "../../src/storage/lancedb.js";
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
    occurredAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-01T09:00:00.000Z",
    payload: {},
    embeddingText: "terminal_command | jest timeout",
    tags: ["jest"],
    links: [],
    redacted: false,
    privacy: { pinned: false, excludedFromSync: false },
    ...overrides
  };
}

describe("clusterIntoLessons", () => {
  let dir: string;
  let lancedb: LanceDbStore;
  const embeddings = new FakeEmbeddingProvider();

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "recall-cluster-"));
    lancedb = await LanceDbStore.open(dir);
  });

  afterEach(() => {
    lancedb.close();
    rmSync(dir, { recursive: true, force: true });
  });

  async function seedEpisode(prefix: string, baseMinute: number): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await lancedb.insertEvent(
        makeEvent({
          id: `${prefix}-${i}`,
          occurredAt: `2026-07-01T09:${String(baseMinute + i).padStart(2, "0")}:00.000Z`
        })
      );
    }
  }

  it("synthesizes a Lesson from a real LLM's JSON output", async () => {
    await seedEpisode("evt", 0);
    const provider = new FakeGenerationProvider(
      JSON.stringify({
        title: "Flaky Jest tests from async teardown leaks",
        summary: "Async handles left open after test completion caused timeouts.",
        whatWorked: "Awaiting the handle close in afterEach",
        whatDidntWork: null
      })
    );

    const lessons = await clusterIntoLessons("local", { lancedb, provider, embeddings });

    expect(lessons).toHaveLength(1);
    expect(lessons[0]?.title).toBe("Flaky Jest tests from async teardown leaks");
    expect(lessons[0]?.whatWorked).toBe("Awaiting the handle close in afterEach");
    expect(lessons[0]?.whatDidntWork).toBeUndefined();
    expect(lessons[0]?.sourceEventIds).toEqual(["evt-0", "evt-1", "evt-2"]);
    expect(lessons[0]?.embeddingModel).toBe(embeddings.modelName);
  });

  it("builds an extractive Lesson directly from events when the provider returns non-JSON", async () => {
    await seedEpisode("evt", 0);
    const provider = new FakeGenerationProvider("- terminal_command | ... | jest timeout");

    const lessons = await clusterIntoLessons("local", { lancedb, provider, embeddings });

    expect(lessons).toHaveLength(1);
    expect(lessons[0]?.title).toBe("terminal_command | jest timeout");
    expect(lessons[0]?.summary).toContain("jest timeout");
  });

  it("does not synthesize a Lesson from a cluster below the minimum size", async () => {
    await lancedb.insertEvent(makeEvent({ id: "evt-only" }));
    const provider = new FakeGenerationProvider();

    const lessons = await clusterIntoLessons("local", { lancedb, provider, embeddings });
    expect(lessons).toEqual([]);
  });

  it("does not re-cluster events already covered by an existing Lesson", async () => {
    await seedEpisode("evt", 0);
    const provider = new FakeGenerationProvider(JSON.stringify({ title: "t", summary: "s" }));

    const firstRun = await clusterIntoLessons("local", { lancedb, provider, embeddings });
    expect(firstRun).toHaveLength(1);

    const secondRun = await clusterIntoLessons("local", { lancedb, provider, embeddings });
    expect(secondRun).toEqual([]);
  });

  it("scopes clustering to the given tenant", async () => {
    await lancedb.insertEvent(makeEvent({ id: "other-1", tenantId: "other-tenant" }));
    await lancedb.insertEvent(
      makeEvent({ id: "other-2", tenantId: "other-tenant", occurredAt: "2026-07-01T09:01:00.000Z" })
    );
    await lancedb.insertEvent(
      makeEvent({ id: "other-3", tenantId: "other-tenant", occurredAt: "2026-07-01T09:02:00.000Z" })
    );

    const provider = new FakeGenerationProvider();
    const lessons = await clusterIntoLessons("local", { lancedb, provider, embeddings });
    expect(lessons).toEqual([]);
  });
});
