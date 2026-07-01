import { describe, expect, it, vi } from "vitest";
import { safeGenerate } from "../../src/generation/safeGenerate.js";
import type { GenerationProvider } from "../../src/generation/provider.js";

describe("safeGenerate", () => {
  it("returns the provider's output when it succeeds", async () => {
    const provider: GenerationProvider = {
      name: "ollama",
      isAvailable: async () => true,
      generate: async () => "generated text"
    };
    expect(await safeGenerate(provider, "prompt")).toBe("generated text");
  });

  it("falls back when the provider throws mid-generation", async () => {
    const provider: GenerationProvider = {
      name: "ollama",
      isAvailable: async () => true,
      generate: async () => {
        throw new Error("model unloaded");
      }
    };
    const fallback: GenerationProvider = {
      name: "extractive-fallback",
      isAvailable: async () => true,
      generate: vi.fn().mockResolvedValue("fallback text")
    };

    const result = await safeGenerate(provider, "- a\n- b", fallback);

    expect(result).toBe("fallback text");
    expect(fallback.generate).toHaveBeenCalledWith("- a\n- b");
  });
});
