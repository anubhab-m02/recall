import { describe, expect, it } from "vitest";
import { buildFileDiff, countChangedLines } from "../../src/capture/diffUtils.js";

describe("countChangedLines", () => {
  it("counts a pure addition", () => {
    const stats = countChangedLines("line1\nline2\n", "line1\nline2\nline3\n");
    expect(stats).toEqual({ added: 1, removed: 0 });
  });

  it("counts a pure removal", () => {
    const stats = countChangedLines("line1\nline2\nline3\n", "line1\nline2\n");
    expect(stats).toEqual({ added: 0, removed: 1 });
  });

  it("counts a mixed edit as both added and removed", () => {
    const stats = countChangedLines("foo\nbar\n", "foo\nbaz\n");
    expect(stats.added).toBeGreaterThan(0);
    expect(stats.removed).toBeGreaterThan(0);
  });

  it("reports no changes for identical text", () => {
    expect(countChangedLines("same\n", "same\n")).toEqual({ added: 0, removed: 0 });
  });
});

describe("buildFileDiff", () => {
  it("produces a unified diff containing both old and new content", () => {
    const diff = buildFileDiff("src/example.ts", "const a = 1;\n", "const a = 2;\n");
    expect(diff).toContain("src/example.ts");
    expect(diff).toContain("-const a = 1;");
    expect(diff).toContain("+const a = 2;");
  });
});
