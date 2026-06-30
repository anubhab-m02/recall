import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryEvent } from "@recall/shared-types";
import { EmbeddingQueue } from "../../src/embeddings/queue.js";
import { LanceDbStore } from "../../src/storage/lancedb.js";
import { FakeEmbeddingProvider } from "../helpers/fakeEmbeddingProvider.js";

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

describe("EmbeddingQueue", () => {
  let dir: string;
  let lancedb: LanceDbStore;
  let provider: FakeEmbeddingProvider;
  let queue: EmbeddingQueue;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "recall-embedqueue-"));
    lancedb = await LanceDbStore.open(dir);
    provider = new FakeEmbeddingProvider(8);
    queue = new EmbeddingQueue(provider, lancedb);
  });

  afterEach(async () => {
    await queue.stop();
    lancedb.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("populates embedding/embeddingModel/embeddingDim after draining", async () => {
    await lancedb.insertEvent(makeEvent());
    queue.enqueue("evt-1");

    await vi.waitFor(async () => {
      const updated = await lancedb.getEventById("evt-1");
      expect(updated?.embedding).toHaveLength(8);
    });

    const updated = await lancedb.getEventById("evt-1");
    expect(updated?.embeddingModel).toBe("fake-test-model");
    expect(updated?.embeddingDim).toBe(8);
  });

  it("processes multiple enqueued events", async () => {
    await lancedb.insertEvent(makeEvent({ id: "evt-1" }));
    await lancedb.insertEvent(makeEvent({ id: "evt-2" }));
    queue.enqueue("evt-1");
    queue.enqueue("evt-2");

    await vi.waitFor(async () => {
      const a = await lancedb.getEventById("evt-1");
      const b = await lancedb.getEventById("evt-2");
      expect(a?.embedding).toBeDefined();
      expect(b?.embedding).toBeDefined();
    });
  });

  it("does not throw when the event was deleted before its turn", async () => {
    queue.enqueue("never-inserted");
    await vi.waitFor(() => {
      expect(queue.size).toBe(0);
    });
  });

  it("does not crash the queue when the provider throws", async () => {
    await lancedb.insertEvent(makeEvent({ id: "evt-1" }));
    await lancedb.insertEvent(makeEvent({ id: "evt-2" }));

    const failingProvider = {
      modelName: "failing",
      dimension: 8,
      embed: vi
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValue([1, 0, 0, 0, 0, 0, 0, 0])
    };
    const failingQueue = new EmbeddingQueue(failingProvider, lancedb);
    failingQueue.enqueue("evt-1"); // fails
    failingQueue.enqueue("evt-2"); // should still be processed

    await vi.waitFor(async () => {
      const second = await lancedb.getEventById("evt-2");
      expect(second?.embedding).toBeDefined();
    });

    const first = await lancedb.getEventById("evt-1");
    expect(first?.embedding).toBeUndefined();
  });
});
