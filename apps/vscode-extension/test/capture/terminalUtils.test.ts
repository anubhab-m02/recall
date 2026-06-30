import { describe, expect, it } from "vitest";
import { buildTerminalEmbeddingText, truncateOutput } from "../../src/capture/terminalUtils.js";

describe("truncateOutput", () => {
  it("joins chunks and truncates to the max length", () => {
    expect(truncateOutput(["abc", "def", "ghi"], 5)).toBe("abcde");
  });

  it("returns everything when under the limit", () => {
    expect(truncateOutput(["short"], 100)).toBe("short");
  });

  it("handles no output at all", () => {
    expect(truncateOutput([], 100)).toBe("");
  });
});

describe("buildTerminalEmbeddingText", () => {
  it("includes the exit code and command", () => {
    expect(buildTerminalEmbeddingText("npm test", 1)).toBe("terminal_command | exit=1 | npm test");
  });
});
