import { describe, expect, it } from "vitest";
import {
  resolveGenerationProvider,
  type GenerationProvider
} from "../../src/generation/provider.js";

function makeProvider(name: string, available: boolean): GenerationProvider {
  return {
    name,
    isAvailable: async () => available,
    generate: async () => `${name} output`
  };
}

describe("resolveGenerationProvider", () => {
  it("picks the first available provider", async () => {
    const provider = await resolveGenerationProvider([
      makeProvider("ollama", true),
      makeProvider("extractive-fallback", true)
    ]);
    expect(provider.name).toBe("ollama");
  });

  it("falls through to a later provider when an earlier one is unavailable", async () => {
    const provider = await resolveGenerationProvider([
      makeProvider("ollama", false),
      makeProvider("extractive-fallback", true)
    ]);
    expect(provider.name).toBe("extractive-fallback");
  });

  it("returns the last candidate even if it reports unavailable, rather than throwing", async () => {
    const provider = await resolveGenerationProvider([
      makeProvider("ollama", false),
      makeProvider("extractive-fallback", false)
    ]);
    expect(provider.name).toBe("extractive-fallback");
  });

  it("throws only when given no candidates at all", async () => {
    await expect(resolveGenerationProvider([])).rejects.toThrow(/no candidates/);
  });
});
