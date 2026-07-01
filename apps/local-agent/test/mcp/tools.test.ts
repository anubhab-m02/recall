import { describe, expect, it, vi } from "vitest";
import type { MemoryEvent } from "@recall/shared-types";
import type { AgentHttpClient } from "../../src/mcp/agentHttpClient.js";
import {
  getDailyStandup,
  getRecentContext,
  getSkillProfile,
  getWeeklySummary,
  saveMemory,
  searchMemory
} from "../../src/mcp/tools.js";

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

function makeFakeClient(overrides: Partial<AgentHttpClient> = {}): AgentHttpClient {
  return {
    search: vi.fn().mockResolvedValue({ results: [] }),
    postEvent: vi.fn(),
    getStandup: vi.fn(),
    getWeeklySummary: vi.fn(),
    getSkillProfile: vi.fn(),
    ...overrides
  };
}

describe("searchMemory", () => {
  it("maps search results to memory refs", async () => {
    const client = makeFakeClient({
      search: vi.fn().mockResolvedValue({ results: [makeEvent({ id: "evt-1" })] })
    });

    const refs = await searchMemory({ query: "jest timeout" }, client);

    expect(client.search).toHaveBeenCalledWith({
      q: "jest timeout",
      project: undefined,
      limit: undefined
    });
    expect(refs).toEqual([
      {
        id: "evt-1",
        type: "terminal_command",
        occurredAt: "2026-07-01T00:00:00.000Z",
        title: "terminal_command | npm test"
      }
    ]);
  });
});

describe("getRecentContext", () => {
  it("passes project through and defaults to no query text", async () => {
    const client = makeFakeClient({
      search: vi.fn().mockResolvedValue({ results: [makeEvent()] })
    });
    await getRecentContext({ project: "/repo" }, client);
    expect(client.search).toHaveBeenCalledWith({ project: "/repo", limit: 20 });
  });

  it("filters client-side by sinceHours", async () => {
    const recent = makeEvent({ id: "recent", occurredAt: new Date().toISOString() });
    const old = makeEvent({ id: "old", occurredAt: "2020-01-01T00:00:00.000Z" });
    const client = makeFakeClient({
      search: vi.fn().mockResolvedValue({ results: [recent, old] })
    });

    const refs = await getRecentContext({ sinceHours: 24 }, client);

    expect(refs.map((r) => r.id)).toEqual(["recent"]);
  });
});

describe("saveMemory", () => {
  it("posts a manual_note event and returns its id", async () => {
    const client = makeFakeClient({
      postEvent: vi.fn().mockResolvedValue(makeEvent({ id: "evt-new" }))
    });

    const result = await saveMemory({ content: "learned something", tags: ["insight"] }, client);

    expect(result).toEqual({ id: "evt-new" });
    expect(client.postEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "manual_note",
        payload: { note: "learned something" },
        tags: ["insight"]
      })
    );
  });
});

describe("getDailyStandup / getWeeklySummary / getSkillProfile", () => {
  it("pass the date/week argument through to the client", async () => {
    const client = makeFakeClient();
    await getDailyStandup({ date: "2026-07-01" }, client);
    expect(client.getStandup).toHaveBeenCalledWith("2026-07-01");

    await getWeeklySummary({ week: "2026-06-29" }, client);
    expect(client.getWeeklySummary).toHaveBeenCalledWith("2026-06-29");

    await getSkillProfile({}, client);
    expect(client.getSkillProfile).toHaveBeenCalled();
  });
});
