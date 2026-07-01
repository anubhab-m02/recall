import { describe, expect, it } from "vitest";
import {
  renderAskRecallPrompt,
  renderDailyStandupPrompt,
  renderLessonSynthesisPrompt,
  renderWeeklySummaryPrompt
} from "../src/index.js";

describe("renderAskRecallPrompt", () => {
  it("includes the question and each memory's id, type, and occurredAt", () => {
    const prompt = renderAskRecallPrompt("how did I configure the staging DB pool?", [
      {
        id: "mem_abc123",
        type: "terminal_command",
        occurredAt: "2026-06-01T00:00:00.000Z",
        embeddingText: "npm run migrate"
      }
    ]);

    expect(prompt).toContain("how did I configure the staging DB pool?");
    expect(prompt).toContain(
      "- [mem_abc123] (terminal_command, 2026-06-01T00:00:00.000Z): npm run migrate"
    );
    expect(prompt).toContain("do not guess");
  });

  it("renders with no memories rather than throwing", () => {
    expect(() => renderAskRecallPrompt("anything?", [])).not.toThrow();
  });
});

describe("renderDailyStandupPrompt", () => {
  it("renders each event as a bullet line the extractive fallback can parse", () => {
    const prompt = renderDailyStandupPrompt([
      {
        type: "terminal_command",
        occurredAt: "2026-07-01T09:00:00.000Z",
        embeddingText: "npm test"
      }
    ]);
    expect(prompt).toContain("- terminal_command | 2026-07-01T09:00:00.000Z | npm test");
  });
});

describe("renderLessonSynthesisPrompt", () => {
  it("asks for JSON output and includes event bullet lines", () => {
    const prompt = renderLessonSynthesisPrompt([
      {
        type: "terminal_command",
        occurredAt: "2026-07-01T09:00:00.000Z",
        embeddingText: "jest timeout"
      }
    ]);
    expect(prompt).toContain("Produce JSON");
    expect(prompt).toContain("- terminal_command | 2026-07-01T09:00:00.000Z | jest timeout");
  });
});

describe("renderWeeklySummaryPrompt", () => {
  it("renders lesson/standup items as bullet lines", () => {
    const prompt = renderWeeklySummaryPrompt([
      { label: "lesson", occurredAt: "2026-07-01", text: "Fixed flaky Jest teardown" }
    ]);
    expect(prompt).toContain("- lesson | 2026-07-01 | Fixed flaky Jest teardown");
  });
});
