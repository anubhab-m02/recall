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

  it("builds context/related query strings from provided params only", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    const client = new AgentClient(DISCOVERY);
    await client.getRelatedContext({ file: "src/foo.ts" });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("file=src%2Ffoo.ts");
    expect(calledUrl).not.toContain("errorText=");
  });

  it("posts a question to /v1/ask", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ answer: "you set it to 20", citations: [] })
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new AgentClient(DISCOVERY);
    const result = await client.ask("how did I configure the pool?");

    expect(result.answer).toBe("you set it to 20");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:47811/v1/ask");
    expect(JSON.parse(init.body as string)).toEqual({ question: "how did I configure the pool?" });
  });

  it("fetches a standup, with an optional date query param", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ date: "2026-07-01" }) });
    vi.stubGlobal("fetch", fetchMock);

    const client = new AgentClient(DISCOVERY);
    await client.getStandup("2026-07-01");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:47811/v1/standup?date=2026-07-01",
      expect.anything()
    );
  });

  it("fetches a weekly summary, with an optional week query param", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ weekOf: "2026-06-29" }) });
    vi.stubGlobal("fetch", fetchMock);

    const client = new AgentClient(DISCOVERY);
    await client.getWeeklySummary("2026-06-29");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:47811/v1/standup/weekly?week=2026-06-29",
      expect.anything()
    );
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
