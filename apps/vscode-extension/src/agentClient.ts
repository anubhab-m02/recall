// Talks to the Local Agent HTTP API (spec §8.1). Deliberately free of any
// `vscode` import so it can be unit tested directly with Vitest — VS
// Code's extension host injects a virtual `vscode` module that doesn't
// exist outside it, so anything importing `vscode` can't be loaded by a
// normal test runner. agentSupervisor.ts is the thin layer that bridges
// this client to the extension host.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_SETTINGS,
  type MemoryEvent,
  type MemoryEventInput,
  type Settings
} from "@recall/shared-types";

export interface AgentDiscovery {
  port: number;
  pid: number;
  token: string;
  startedAt: string;
  version: string;
}

export interface SearchParams {
  q?: string;
  type?: string;
  project?: string;
  since?: string;
  limit?: number;
}

export interface SearchResponse {
  results: MemoryEvent[];
}

// Mirrors apps/local-agent/src/paths.ts's RECALL_HOME convention so the
// extension and agent agree on where the discovery file lives (spec §6.7).
export function getRecallHome(): string {
  return process.env.RECALL_HOME ?? join(homedir(), ".recall");
}

export function getAgentDiscoveryPath(): string {
  return join(getRecallHome(), "agent.json");
}

export function readDiscoveryFile(): AgentDiscovery | undefined {
  const path = getAgentDiscoveryPath();
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as AgentDiscovery;
  } catch {
    // A discovery file mid-write or corrupted by a crash is treated the
    // same as "agent not running" — agentSupervisor will spawn a fresh one.
    return undefined;
  }
}

export class AgentClient {
  constructor(private readonly discovery: AgentDiscovery) {}

  get port(): number {
    return this.discovery.port;
  }

  private get baseUrl(): string {
    return `http://127.0.0.1:${this.discovery.port}`;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${this.discovery.token}`,
        ...init.headers
      }
    });
    if (!res.ok) {
      const method = init.method ?? "GET";
      throw new Error(`Recall Local Agent request failed: ${method} ${path} -> ${res.status}`);
    }
    return (await res.json()) as T;
  }

  // Static so agentSupervisor can health-check a candidate port before a
  // discovery file (and thus a token) is even known to be trustworthy.
  static async health(port: number): Promise<boolean> {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  postEvent(input: MemoryEventInput): Promise<MemoryEvent> {
    return this.request<MemoryEvent>("/v1/events", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  postEventsBatch(inputs: MemoryEventInput[]): Promise<{ events: MemoryEvent[] }> {
    return this.request("/v1/events/batch", {
      method: "POST",
      body: JSON.stringify({ events: inputs })
    });
  }

  search(params: SearchParams = {}): Promise<SearchResponse> {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.type) query.set("type", params.type);
    if (params.project) query.set("project", params.project);
    if (params.since) query.set("since", params.since);
    if (params.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    return this.request<SearchResponse>(`/v1/search${qs ? `?${qs}` : ""}`);
  }

  getSettings(): Promise<Settings> {
    return this.request<Settings>("/v1/settings");
  }

  updateSettings(partial: Partial<Settings>): Promise<Settings> {
    return this.request<Settings>("/v1/settings", {
      method: "POST",
      body: JSON.stringify(partial)
    });
  }

  pauseCapture(): Promise<Settings> {
    return this.request<Settings>("/v1/capture/pause", { method: "POST" });
  }

  resumeCapture(): Promise<Settings> {
    return this.request<Settings>("/v1/capture/resume", { method: "POST" });
  }

  testRedaction(text: string): Promise<{ redacted: string; findings: unknown[] }> {
    return this.request("/v1/redaction/test", { method: "POST", body: JSON.stringify({ text }) });
  }
}

// Capture listeners fire far more often than settings change (every save/
// terminal command vs. an occasional toggle), so they read a synchronous
// cached snapshot instead of hitting the agent over HTTP on every event.
// Call refresh() once at startup and again after any pause/resume or
// settings-update action.
export class SettingsCache {
  private current: Settings = DEFAULT_SETTINGS;

  constructor(private readonly client: AgentClient) {}

  get(): Settings {
    return this.current;
  }

  async refresh(): Promise<Settings> {
    this.current = await this.client.getSettings();
    return this.current;
  }
}
