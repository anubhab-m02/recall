import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueEvent, listQueuedEvents } from "../../src/background/eventQueue.js";
import { flushQueue } from "../../src/background/flushQueue.js";
import type { MemoryEventInput } from "@recall/shared-types";

function makeInput(embeddingText: string): MemoryEventInput {
  return {
    tenantId: "local",
    deviceId: "device-1",
    source: "browser",
    type: "page_visit",
    occurredAt: "2026-07-01T00:00:00.000Z",
    payload: { title: "MDN", canonicalUrl: "https://developer.mozilla.org/x", dwellMs: 5000 },
    embeddingText
  };
}

describe("flushQueue", () => {
  beforeEach(() => {
    indexedDB.deleteDatabase("recall-capture-queue");
  });

  it("delivers everything and empties the queue when the agent is reachable", async () => {
    await enqueueEvent(makeInput("a"));
    await enqueueEvent(makeInput("b"));

    const postEvent = vi.fn().mockResolvedValue({});
    const result = await flushQueue({ postEvent });

    expect(result).toEqual({ flushed: 2, remaining: 0 });
    expect(postEvent).toHaveBeenCalledTimes(2);
    expect(await listQueuedEvents()).toEqual([]);
  });

  it("stops at the first failure and leaves the rest queued for the next flush (worker-restart durability)", async () => {
    await enqueueEvent(makeInput("a"));
    await enqueueEvent(makeInput("b"));

    const postEvent = vi.fn().mockRejectedValueOnce(new Error("agent unreachable"));
    const result = await flushQueue({ postEvent });

    expect(result).toEqual({ flushed: 0, remaining: 2 });
    expect(await listQueuedEvents()).toHaveLength(2);
  });

  it("is a no-op on an empty queue", async () => {
    const postEvent = vi.fn();
    expect(await flushQueue({ postEvent })).toEqual({ flushed: 0, remaining: 0 });
    expect(postEvent).not.toHaveBeenCalled();
  });
});
