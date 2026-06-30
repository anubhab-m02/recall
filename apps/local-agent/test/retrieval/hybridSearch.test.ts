import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MemoryEvent } from "@recall/shared-types";
import {
  cosineSimilarity,
  hybridSearch,
  keywordOverlapScore,
  recencyScore
} from "../../src/retrieval/hybridSearch.js";
import { LanceDbStore } from "../../src/storage/lancedb.js";
import { FakeEmbeddingProvider } from "../helpers/fakeEmbeddingProvider.js";

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns 0 for mismatched lengths instead of throwing", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it("returns 0 for a zero vector instead of NaN", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("keywordOverlapScore", () => {
  const event = {
    embeddingText: "terminal_command | exit=1 | jest timeout exceeded",
    tags: ["jest"],
    payload: { command: "npm test" }
  } as MemoryEvent;

  it("scores 1 when every query term matches", () => {
    expect(keywordOverlapScore("jest timeout", event)).toBe(1);
  });

  it("scores partial overlap proportionally", () => {
    expect(keywordOverlapScore("jest nonexistent", event)).toBe(0.5);
  });

  it("scores 0 for an empty query", () => {
    expect(keywordOverlapScore("", event)).toBe(0);
  });
});

describe("recencyScore", () => {
  const now = new Date("2026-07-31T00:00:00.000Z").getTime();

  it("is 1 for an event that just occurred", () => {
    expect(recencyScore("2026-07-31T00:00:00.000Z", false, now)).toBeCloseTo(1);
  });

  it("is ~0.5 at the half-life boundary (30 days)", () => {
    expect(recencyScore("2026-07-01T00:00:00.000Z", false, now)).toBeCloseTo(0.5, 1);
  });

  it("is always 1 for a pinned item regardless of age", () => {
    expect(recencyScore("2020-01-01T00:00:00.000Z", true, now)).toBe(1);
  });
});

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
    tags: [],
    links: [],
    redacted: false,
    privacy: { pinned: false, excludedFromSync: false },
    ...overrides
  };
}

describe("hybridSearch", () => {
  let dir: string;
  let lancedb: LanceDbStore;
  let embeddings: FakeEmbeddingProvider;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "recall-hybridsearch-"));
    lancedb = await LanceDbStore.open(dir);
    embeddings = new FakeEmbeddingProvider(8);
  });

  afterEach(() => {
    lancedb.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("ranks an exact keyword match above an unrelated event", async () => {
    await lancedb.insertEvent(
      makeEvent({
        id: "evt-jest",
        embeddingText: "terminal_command | exit=1 | jest timeout exceeded"
      })
    );
    await lancedb.insertEvent(
      makeEvent({ id: "evt-build", embeddingText: "terminal_command | exit=0 | npm build" })
    );

    const results = await hybridSearch(
      { tenantId: "local", query: "jest timeout" },
      { lancedb, embeddings }
    );

    expect(results[0]?.id).toBe("evt-jest");
  });

  it("only compares vectors stamped with the same embedding model", async () => {
    const matchingVector = await embeddings.embed("anything");
    await lancedb.insertEvent(
      makeEvent({
        id: "evt-stale-model",
        embedding: matchingVector,
        embeddingModel: "some-other-model",
        embeddingDim: matchingVector.length
      })
    );

    // Should not throw despite the dimension/model mismatch, and should
    // still fall back to keyword+recency scoring.
    const results = await hybridSearch({ tenantId: "local" }, { lancedb, embeddings });
    expect(results).toHaveLength(1);
  });

  it("falls back to keyword+recency without throwing when given no query", async () => {
    await lancedb.insertEvent(makeEvent());
    const results = await hybridSearch({ tenantId: "local" }, { lancedb, embeddings });
    expect(results).toHaveLength(1);
  });

  it("respects the limit option", async () => {
    for (let i = 0; i < 5; i++) {
      await lancedb.insertEvent(makeEvent({ id: `evt-${i}` }));
    }
    const results = await hybridSearch({ tenantId: "local", limit: 2 }, { lancedb, embeddings });
    expect(results).toHaveLength(2);
  });
});
