import { describe, expect, it } from "vitest";
import { formatStatusBarState, startOfLocalDayIso } from "../../src/ui/statusBarFormat.js";

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

  it("omits the count suffix when no count is available yet", () => {
    const state = formatStatusBarState(false);
    expect(state.text).toBe("$(record) Recall: Active");
  });

  it("appends today's capture count when active", () => {
    const state = formatStatusBarState(false, 12);
    expect(state.text).toBe("$(record) Recall: Active · 12 today");
  });

  it("does not append a count suffix while paused, even if a count is passed", () => {
    const state = formatStatusBarState(true, 12);
    expect(state.text).toBe("$(circle-slash) Recall: Paused");
  });
});

describe("startOfLocalDayIso", () => {
  it("returns local midnight of the given date, not UTC midnight", () => {
    const now = new Date(2026, 6, 1, 23, 45, 0); // local: 2026-07-01 23:45
    const iso = startOfLocalDayIso(now);
    const parsed = new Date(iso);
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(6);
    expect(parsed.getDate()).toBe(1);
    expect(parsed.getHours()).toBe(0);
    expect(parsed.getMinutes()).toBe(0);
  });
});
