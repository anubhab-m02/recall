import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaProvider } from "../../src/generation/ollamaProvider.js";

describe("OllamaProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is available when Ollama's tags endpoint responds ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    expect(await new OllamaProvider().isAvailable()).toBe(true);
  });

  it("is not available when Ollama is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    expect(await new OllamaProvider().isAvailable()).toBe(false);
  });

  it("is not available when the endpoint responds with an error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    expect(await new OllamaProvider().isAvailable()).toBe(false);
  });

  it("generates by posting the prompt and returning the response text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: "Yesterday: fixed the flaky test." })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OllamaProvider().generate("summarize this");

    expect(result).toBe("Yesterday: fixed the flaky test.");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:11434/api/generate");
    expect(JSON.parse(init.body as string)).toMatchObject({
      prompt: "summarize this",
      stream: false
    });
  });

  it("throws a descriptive error on a non-ok generate response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(new OllamaProvider().generate("x")).rejects.toThrow(/503/);
  });
});
