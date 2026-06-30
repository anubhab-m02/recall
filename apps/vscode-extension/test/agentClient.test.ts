import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgentClient,
  getAgentDiscoveryPath,
  readDiscoveryFile,
  type AgentDiscovery
} from "../src/agentClient.js";

const DISCOVERY: AgentDiscovery = {
  port: 47811,
  pid: 1234,
  token: "test-token",
  startedAt: "2026-07-01T00:00:00.000Z",
  version: "0.1.0"
};

describe("readDiscoveryFile", () => {
  let dir: string;
  let previousHome: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "recall-vscode-discovery-"));
    previousHome = process.env.RECALL_HOME;
    process.env.RECALL_HOME = dir;
  });

  afterEach(() => {
    if (previousHome === undefined) {
      delete process.env.RECALL_HOME;
    } else {
      process.env.RECALL_HOME = previousHome;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns undefined when no agent has ever started", () => {
    expect(readDiscoveryFile()).toBeUndefined();
  });

  it("reads a written discovery file", () => {
    writeFileSync(getAgentDiscoveryPath(), JSON.stringify(DISCOVERY));
    expect(readDiscoveryFile()).toEqual(DISCOVERY);
  });

  it("treats a corrupted discovery file as absent rather than throwing", () => {
    writeFileSync(getAgentDiscoveryPath(), "{not valid json");
    expect(readDiscoveryFile()).toBeUndefined();
  });
});

describe("AgentClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("attaches the bearer token to every request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok" })
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new AgentClient(DISCOVERY);
    await client.getSettings();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:47811/v1/settings",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-token" })
      })
    );
  });

  it("builds search query strings from provided params only", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    const client = new AgentClient(DISCOVERY);
    await client.search({ q: "jest timeout", limit: 5 });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("q=jest+timeout");
    expect(calledUrl).toContain("limit=5");
    expect(calledUrl).not.toContain("type=");
  });

  it("throws a descriptive error on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    );

    const client = new AgentClient(DISCOVERY);
    await expect(client.getSettings()).rejects.toThrow(/401/);
  });

  it("health() returns false instead of throwing when the agent is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    expect(await AgentClient.health(47811)).toBe(false);
  });

  it("health() returns true for a 200 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    expect(await AgentClient.health(47811)).toBe(true);
  });
});
