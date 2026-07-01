// Talks to the Local Agent HTTP API (spec §8.1) from the extension's
// background service worker, sending the capability token (SEC-4a) on
// every request. Mirrors apps/vscode-extension/src/agentClient.ts's shape,
// but a browser extension can't read the OS-file discovery document a
// desktop process can — spec §13 Phase 5 calls this "a paired-token flow":
// the user copies the port + token out of ~/.recall/agent.json once (see
// test/manual/phase5-browser-extension.md) and pastes them into the popup,
// which persists them via pairingStore.ts. Kept free of `chrome` so the
// request-building logic here is unit-testable with a mocked fetch.

import type { MemoryEvent, MemoryEventInput, Settings } from "@recall/shared-types";

export interface PairingInfo {
  port: number;
  token: string;
}

export class AgentClient {
  constructor(private readonly pairing: PairingInfo) {}

  private get baseUrl(): string {
    return `http://127.0.0.1:${this.pairing.port}`;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${this.pairing.token}`,
        ...init.headers
      }
    });
    if (!res.ok) {
      const method = init.method ?? "GET";
      throw new Error(`Recall Local Agent request failed: ${method} ${path} -> ${res.status}`);
    }
    return (await res.json()) as T;
  }

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
}
