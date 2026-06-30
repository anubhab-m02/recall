import { describe, expect, it } from "vitest";
import {
  formatMemoryDescription,
  formatMemoryLabel,
  resolveEventFilePath
} from "../../src/ui/sidebarFormat.js";

describe("formatMemoryLabel", () => {
  it("returns short text unchanged", () => {
    expect(formatMemoryLabel({ embeddingText: "terminal_command | exit=0 | npm test" })).toBe(
      "terminal_command | exit=0 | npm test"
    );
  });

  it("truncates long text with an ellipsis", () => {
    const long = "a".repeat(200);
    const label = formatMemoryLabel({ embeddingText: long });
    expect(label.length).toBe(80);
    expect(label.endsWith("…")).toBe(true);
  });
});

describe("formatMemoryDescription", () => {
  it("includes the event type and a formatted date", () => {
    const description = formatMemoryDescription({
      type: "terminal_command",
      occurredAt: "2026-07-01T00:00:00.000Z"
    });
    expect(description).toContain("terminal_command");
  });

  it("falls back to the raw string for an unparseable date", () => {
    const description = formatMemoryDescription({ type: "manual_note", occurredAt: "not-a-date" });
    expect(description).toBe("manual_note · not-a-date");
  });
});

describe("resolveEventFilePath", () => {
  it("prefers the event's own project root", () => {
    const path = resolveEventFilePath(
      { project: { repoRoot: "/repo/a" }, context: { filePath: "src/index.ts" } },
      "/repo/b"
    );
    expect(path).toBe("/repo/a/src/index.ts");
  });

  it("falls back to the workspace root when the event has none", () => {
    const path = resolveEventFilePath({ context: { filePath: "src/index.ts" } }, "/repo/b");
    expect(path).toBe("/repo/b/src/index.ts");
  });

  it("returns undefined when there is no file path at all", () => {
    expect(resolveEventFilePath({}, "/repo/b")).toBeUndefined();
  });

  it("returns undefined when there is no root to resolve against", () => {
    expect(
      resolveEventFilePath({ context: { filePath: "src/index.ts" } }, undefined)
    ).toBeUndefined();
  });
});
