import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MemoryEvent } from "@recall/shared-types";
import { ragAsk } from "../../src/retrieval/ragAsk.js";
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
    occurredAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    payload: {},
    embeddingText: "terminal_command | staging db pool configured to 20 connections",
    tags: [],
    links: [],
    redacted: false,
    privacy: { pinned: false, excludedFromSync: false },
    ...overrides
  };
}

describe("ragAsk", () => {
  let dir: string;
  let lancedb: LanceDbStore;
  const embeddings = new FakeEmbeddingProvider();

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "recall-ragask-"));
    lancedb = await LanceDbStore.open(dir);
  });

  afterEach(() => {
    lancedb.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns a synthesized answer with citations for retrieved memories", async () => {
    await lancedb.insertEvent(makeEvent({ id: "evt-1" }));
    const provider = new FakeGenerationProvider("You set it to 20 connections [evt-1].");

    const result = await ragAsk("local", "how did I configure the staging db pool?", {
      lancedb,
      embeddings,
      provider
    });

    expect(result.answer).toBe("You set it to 20 connections [evt-1].");
    expect(result.citations).toEqual([
      { id: "evt-1", type: "terminal_command", occurredAt: "2026-07-01T00:00:00.000Z" }
    ]);
  });

  it("says it doesn't have a memory rather than hallucinating when nothing matches", async () => {
    const provider = new FakeGenerationProvider("should not be called");
    const result = await ragAsk("local", "anything at all?", { lancedb, embeddings, provider });

    expect(result.answer).toBe("I don't have a memory about that.");
    expect(result.citations).toEqual([]);
  });

  it("still answers via the extractive fallback when generation fails", async () => {
    await lancedb.insertEvent(makeEvent({ id: "evt-1" }));
    const failingProvider = {
      name: "unavailable",
      isAvailable: async () => false,
      generate: async () => {
        throw new Error("no model");
      }
    };

    const result = await ragAsk("local", "staging db pool", {
      lancedb,
      embeddings,
      provider: failingProvider
    });

    expect(result.answer).toContain("staging db pool");
    expect(result.citations).toHaveLength(1);
  });
});
