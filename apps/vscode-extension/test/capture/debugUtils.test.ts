import { describe, expect, it } from "vitest";
import { buildDebugSessionEmbeddingText } from "../../src/capture/debugUtils.js";

describe("buildDebugSessionEmbeddingText", () => {
  it("includes just the launch config name when there were no exceptions", () => {
    expect(buildDebugSessionEmbeddingText("Launch Program", undefined)).toBe(
      "debug_session | Launch Program"
    );
    expect(buildDebugSessionEmbeddingText("Launch Program", [])).toBe(
      "debug_session | Launch Program"
    );
  });

  it("appends exception messages when present", () => {
    const text = buildDebugSessionEmbeddingText("Launch Program", [
      { message: "TypeError: x is not a function", stack: "" },
      { message: "Timeout exceeded", stack: "" }
    ]);
    expect(text).toBe(
      "debug_session | Launch Program | TypeError: x is not a function; Timeout exceeded"
    );
  });
});
