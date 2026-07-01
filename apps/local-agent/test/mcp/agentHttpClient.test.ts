import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeDiscoveryFile } from "../../src/agentLifecycle.js";
import { createAgentHttpClient, NoAgentRunningError } from "../../src/mcp/agentHttpClient.js";

describe("createAgentHttpClient", () => {
  let dir: string;
  let previousHome: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "recall-mcp-client-"));
    previousHome = process.env.RECALL_HOME;
    process.env.RECALL_HOME = dir;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (previousHome === undefined) {
      delete process.env.RECALL_HOME;
    } else {
      process.env.RECALL_HOME = previousHome;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("throws NoAgentRunningError when no discovery file exists", () => {
    expect(() => createAgentHttpClient()).toThrow(NoAgentRunningError);
  });

  it("attaches the bearer token from the discovery file to every request", async () => {
    writeDiscoveryFile({
      port: 47811,
      pid: 1234,
      token: "test-token",
      startedAt: "2026-07-01T00:00:00.000Z",
      version: "0.1.0"
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    const client = createAgentHttpClient();
    await client.search({ q: "jest timeout" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:47811/v1/search?q=jest+timeout",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-token" })
      })
    );
  });

  it("throws a descriptive error on a non-ok response", async () => {
    writeDiscoveryFile({
      port: 47811,
      pid: 1234,
      token: "test-token",
      startedAt: "2026-07-01T00:00:00.000Z",
      version: "0.1.0"
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    );

    const client = createAgentHttpClient();
    await expect(client.getSkillProfile()).rejects.toThrow(/401/);
  });
});
