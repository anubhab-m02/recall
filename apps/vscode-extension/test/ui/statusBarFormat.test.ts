import { describe, expect, it } from "vitest";
import { formatStatusBarState } from "../../src/ui/statusBarFormat.js";

describe("formatStatusBarState", () => {
  it("shows an active state when not paused", () => {
    const state = formatStatusBarState(false);
    expect(state.text).toContain("Active");
    expect(state.tooltip).toContain("pause");
  });

  it("shows a paused state when paused", () => {
    const state = formatStatusBarState(true);
    expect(state.text).toContain("Paused");
    expect(state.tooltip).toContain("resume");
  });
});
