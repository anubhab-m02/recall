// Weekly learning summary prompt (spec FR-21, §11.5). Appendix A doesn't
// give a literal template for this one (only daily standup, lesson
// synthesis, and RAG ask are spelled out) — this mirrors dailyStandup.ts's
// bullet-line style and instructions so the same extractive fallback
// (which looks for "- " bullet lines) still produces a usable draft.
// Synthesized from the week's Lessons and daily standups (FR-21), not raw
// events — jobs/weeklySummary.ts is responsible for gathering those.

import type { PromptSummaryItem } from "./types.js";

export function renderWeeklySummaryPrompt(items: PromptSummaryItem[]): string {
  const itemLines = items
    .map((item) => `- ${item.label} | ${item.occurredAt} | ${item.text}`)
    .join("\n");

  return [
    "Synthesize the developer's week from the lessons/standups below into a short",
    "narrative summary: what repos/problems they worked across, and any recurring",
    "patterns worth noticing. Do not invent activity not represented below.",
    "",
    "This week's activity:",
    itemLines
  ].join("\n");
}
