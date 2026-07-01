import { describe, expect, it } from "vitest";
import type { MemoryEvent } from "@recall/shared-types";
import { clusterEventsByTimeWindow } from "../../src/jobs/clustering.js";

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
    embeddingText: "terminal_command | npm test",
    tags: [],
    links: [],
    redacted: false,
    privacy: { pinned: false, excludedFromSync: false },
    ...overrides
  };
}

describe("clusterEventsByTimeWindow", () => {
  it("groups events within the window into one cluster", () => {
    const events = [
      makeEvent({ id: "e1", occurredAt: "2026-07-01T09:00:00.000Z" }),
      makeEvent({ id: "e2", occurredAt: "2026-07-01T09:05:00.000Z" }),
      makeEvent({ id: "e3", occurredAt: "2026-07-01T09:10:00.000Z" })
    ];
    const clusters = clusterEventsByTimeWindow(events, 30 * 60 * 1000);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
  });

  it("splits events far apart in time into separate clusters", () => {
    const events = [
      makeEvent({ id: "e1", occurredAt: "2026-07-01T09:00:00.000Z" }),
      makeEvent({ id: "e2", occurredAt: "2026-07-01T15:00:00.000Z" })
    ];
    const clusters = clusterEventsByTimeWindow(events, 30 * 60 * 1000);
    expect(clusters).toHaveLength(2);
  });

  it("splits events in the same time window but different projects", () => {
    const events = [
      makeEvent({
        id: "e1",
        occurredAt: "2026-07-01T09:00:00.000Z",
        project: { repoRoot: "/repo-a" }
      }),
      makeEvent({
        id: "e2",
        occurredAt: "2026-07-01T09:05:00.000Z",
        project: { repoRoot: "/repo-b" }
      })
    ];
    const clusters = clusterEventsByTimeWindow(events, 30 * 60 * 1000);
    expect(clusters).toHaveLength(2);
  });

  it("sorts out-of-order input chronologically before clustering", () => {
    const events = [
      makeEvent({ id: "e2", occurredAt: "2026-07-01T09:05:00.000Z" }),
      makeEvent({ id: "e1", occurredAt: "2026-07-01T09:00:00.000Z" })
    ];
    const clusters = clusterEventsByTimeWindow(events, 30 * 60 * 1000);
    expect(clusters[0]?.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("returns an empty array for no events", () => {
    expect(clusterEventsByTimeWindow([], 1000)).toEqual([]);
  });
});
