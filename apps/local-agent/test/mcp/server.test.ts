// Exercises the real MCP SDK wiring end-to-end (spec §13 Phase 7 DoD:
// "can successfully call search_memory and get_daily_standup and receive
// correct, real data") — a real Client talking to buildMcpServer's real
// McpServer over a linked in-memory transport pair, not just calling the
// tools.ts handlers directly. The AgentHttpClient is faked here (real
// HTTP-proxy behavior is covered by agentHttpClient's own tests plus the
// manual DoD script, since it needs an actual running agent process).

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import type { MemoryEvent } from "@recall/shared-types";
import type { AgentHttpClient } from "../../src/mcp/agentHttpClient.js";
import { buildMcpServer } from "../../src/mcp/server.js";

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
    embeddingText: "terminal_command | jest timeout exceeded",
    tags: [],
    links: [],
    redacted: false,
    privacy: { pinned: false, excludedFromSync: false },
    ...overrides
  };
}

async function connectedClient(agentClient: AgentHttpClient): Promise<Client> {
  const server = buildMcpServer(agentClient);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

function textOf(result: { content: { type: string; text?: string }[] }): unknown {
  const first = result.content[0];
  return first?.text ? JSON.parse(first.text) : undefined;
}

describe("MCP server (spec §13 Phase 7 DoD)", () => {
  it("lists all six required tools (spec FR-23)", async () => {
    const client = await connectedClient({
      search: vi.fn(),
      postEvent: vi.fn(),
      getStandup: vi.fn(),
      getWeeklySummary: vi.fn(),
      getSkillProfile: vi.fn()
    });

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_daily_standup",
      "get_recent_context",
      "get_skill_profile",
      "get_weekly_summary",
      "save_memory",
      "search_memory"
    ]);
  });

  it("search_memory returns correct, real data from a seeded agent client", async () => {
    const agentClient: AgentHttpClient = {
      search: vi.fn().mockResolvedValue({ results: [makeEvent({ id: "evt-jest" })] }),
      postEvent: vi.fn(),
      getStandup: vi.fn(),
      getWeeklySummary: vi.fn(),
      getSkillProfile: vi.fn()
    };
    const client = await connectedClient(agentClient);

    const result = await client.callTool({
      name: "search_memory",
      arguments: { query: "jest timeout" }
    });

    expect(agentClient.search).toHaveBeenCalledWith({
      q: "jest timeout",
      project: undefined,
      limit: undefined
    });
    expect(textOf(result as { content: { type: string; text?: string }[] })).toEqual([
      {
        id: "evt-jest",
        type: "terminal_command",
        occurredAt: "2026-07-01T00:00:00.000Z",
        title: "terminal_command | jest timeout exceeded"
      }
    ]);
  });

  it("get_daily_standup returns the standup from the agent client", async () => {
    const standup = {
      id: "standup-2026-07-01",
      date: "2026-07-01",
      generatedAt: "2026-07-01T09:00:00.000Z",
      draftText: "Yesterday: fixed the flaky test.",
      sourceEventIds: ["evt-1"]
    };
    const agentClient: AgentHttpClient = {
      search: vi.fn(),
      postEvent: vi.fn(),
      getStandup: vi.fn().mockResolvedValue(standup),
      getWeeklySummary: vi.fn(),
      getSkillProfile: vi.fn()
    };
    const client = await connectedClient(agentClient);

    const result = await client.callTool({ name: "get_daily_standup", arguments: {} });

    expect(textOf(result as { content: { type: string; text?: string }[] })).toEqual(standup);
  });

  it("save_memory posts a manual_note event via the agent client", async () => {
    const agentClient: AgentHttpClient = {
      search: vi.fn(),
      postEvent: vi.fn().mockResolvedValue(makeEvent({ id: "evt-saved" })),
      getStandup: vi.fn(),
      getWeeklySummary: vi.fn(),
      getSkillProfile: vi.fn()
    };
    const client = await connectedClient(agentClient);

    const result = await client.callTool({
      name: "save_memory",
      arguments: { content: "insight worth keeping" }
    });

    expect(textOf(result as { content: { type: string; text?: string }[] })).toEqual({
      id: "evt-saved"
    });
  });
});
