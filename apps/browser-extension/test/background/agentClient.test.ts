import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentClient } from "../../src/background/agentClient.js";

const PAIRING = { port: 47811, token: "test-token" };

describe("AgentClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("attaches the bearer token to every request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "ok" }) });
    vi.stubGlobal("fetch", fetchMock);

    const client = new AgentClient(PAIRING);
    await client.getSettings();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:47811/v1/settings",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-token" })
      })
    );
  });

  it("throws a descriptive error on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    );

    const client = new AgentClient(PAIRING);
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

  it("posts an event with a JSON content-type header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "evt-1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const client = new AgentClient(PAIRING);
    await client.postEvent({
      tenantId: "local",
      deviceId: "device-1",
      source: "browser",
      type: "page_visit",
      occurredAt: "2026-07-01T00:00:00.000Z",
      payload: { title: "t", canonicalUrl: "https://github.com", dwellMs: 1000 },
      embeddingText: "page_visit | t"
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });
});
