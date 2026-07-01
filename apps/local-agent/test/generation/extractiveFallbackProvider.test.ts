import { describe, expect, it } from "vitest";
import { ExtractiveFallbackProvider } from "../../src/generation/extractiveFallbackProvider.js";

describe("ExtractiveFallbackProvider", () => {
  it("is always available", async () => {
    expect(await new ExtractiveFallbackProvider().isAvailable()).toBe(true);
  });

  it("extracts bullet lines from a rendered prompt", async () => {
    const prompt = [
      "Summarize the developer's work:",
      "",
      "Events:",
      "- terminal_command | 2026-07-01T00:00:00.000Z | npm test",
      "- git_commit | 2026-07-01T01:00:00.000Z | fix flaky test"
    ].join("\n");

    const result = await new ExtractiveFallbackProvider().generate(prompt);
    expect(result).toBe(
      "- terminal_command | 2026-07-01T00:00:00.000Z | npm test\n- git_commit | 2026-07-01T01:00:00.000Z | fix flaky test"
    );
  });

  it("returns a plain message when there are no bullet lines to extract", async () => {
    const result = await new ExtractiveFallbackProvider().generate("no bullets here");
    expect(result).toBe("No relevant memories found.");
  });
});
