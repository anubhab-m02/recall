// The MCP server (spec FR-23/24) is a mode of the same agent process, not
// a reimplementation — rather than opening its own LanceDB/SQLite
// connections (risky for concurrent-writer safety alongside an already
// running `recall-agent start` daemon, and genuinely a second copy of the
// storage/retrieval logic), `recall-agent mcp` proxies to the one true
// running agent over the same HTTP API + capability token every other
// client (VS Code, browser extension) already uses. Every MCP tool call
// below hits an endpoint whose actual logic lives in server/http.ts —
// nothing here re-derives search/generation behavior.

import type {
  DailyStandup,
  MemoryEvent,
  MemoryEventInput,
  SkillProfile,
  WeeklySummary
} from "@recall/shared-types";
import { readDiscoveryFile } from "../agentLifecycle.js";

export interface AgentHttpClient {
  search(params: {
    q?: string;
    project?: string;
    limit?: number;
  }): Promise<{ results: MemoryEvent[] }>;
  postEvent(input: MemoryEventInput): Promise<MemoryEvent>;
  getStandup(date?: string): Promise<DailyStandup>;
  getWeeklySummary(week?: string): Promise<WeeklySummary>;
  getSkillProfile(): Promise<SkillProfile>;
}

export class NoAgentRunningError extends Error {
  constructor() {
    super(
      "No running Recall Local Agent found. Start it first with `recall-agent start` — " +
        "the MCP server proxies to that process rather than opening its own storage."
    );
    this.name = "NoAgentRunningError";
  }
}

export function createAgentHttpClient(): AgentHttpClient {
  const discovery = readDiscoveryFile();
  if (!discovery) throw new NoAgentRunningError();

  const baseUrl = `http://127.0.0.1:${discovery.port}`;
  const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${discovery.token}`,
        ...init.headers
      }
    });
    if (!res.ok) {
      const method = init.method ?? "GET";
      throw new Error(`Recall Local Agent request failed: ${method} ${path} -> ${res.status}`);
    }
    return (await res.json()) as T;
  };

  return {
    search(params) {
      const query = new URLSearchParams();
      if (params.q) query.set("q", params.q);
      if (params.project) query.set("project", params.project);
      if (params.limit) query.set("limit", String(params.limit));
      const qs = query.toString();
      return request(`/v1/search${qs ? `?${qs}` : ""}`);
    },
    postEvent(input) {
      return request("/v1/events", { method: "POST", body: JSON.stringify(input) });
    },
    getStandup(date) {
      return request(`/v1/standup${date ? `?date=${encodeURIComponent(date)}` : ""}`);
    },
    getWeeklySummary(week) {
      return request(`/v1/standup/weekly${week ? `?week=${encodeURIComponent(week)}` : ""}`);
    },
    getSkillProfile() {
      return request("/v1/skill-profile");
    }
  };
}
