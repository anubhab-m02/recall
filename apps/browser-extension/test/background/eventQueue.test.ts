import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  enqueueEvent,
  listQueuedEvents,
  removeQueuedEvent
} from "../../src/background/eventQueue.js";
import type { MemoryEventInput } from "@recall/shared-types";

function makeInput(overrides: Partial<MemoryEventInput> = {}): MemoryEventInput {
  return {
    tenantId: "local",
    deviceId: "device-1",
    source: "browser",
    type: "page_visit",
    occurredAt: "2026-07-01T00:00:00.000Z",
    payload: { title: "MDN", canonicalUrl: "https://developer.mozilla.org/x", dwellMs: 5000 },
    embeddingText: "page_visit | MDN",
    ...overrides
  };
}

describe("eventQueue (durable capture queue, spec NFR-REL-2)", () => {
  beforeEach(async () => {
    // fresh IndexedDB per test — fake-indexeddb persists across tests in
    // the same module otherwise.
    indexedDB.deleteDatabase("recall-capture-queue");
  });

  it("starts empty", async () => {
    expect(await listQueuedEvents()).toEqual([]);
  });

  it("persists an enqueued event and assigns it a queueId", async () => {
    await enqueueEvent(makeInput());
    const queued = await listQueuedEvents();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.queueId).toBeTypeOf("number");
    expect(queued[0]?.input).toEqual(makeInput());
  });

  it("preserves multiple queued events across separate connections (simulated worker restart)", async () => {
    await enqueueEvent(makeInput({ embeddingText: "first" }));
    await enqueueEvent(makeInput({ embeddingText: "second" }));

    // Each call opens and closes its own IndexedDB connection, so this
    // mirrors a fresh service-worker instance reading back the queue.
    const queued = await listQueuedEvents();
    expect(queued.map((q) => q.input.embeddingText)).toEqual(["first", "second"]);
  });

  it("removes a queued event by queueId", async () => {
    await enqueueEvent(makeInput());
    const [first] = await listQueuedEvents();
    await removeQueuedEvent(first!.queueId);
    expect(await listQueuedEvents()).toEqual([]);
  });
});
