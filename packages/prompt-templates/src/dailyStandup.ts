// Daily standup prompt (spec Appendix A, FR-20). Every event line uses the
// "- {type} | {occurredAt} | {embeddingText}" convention deliberately —
// generation/extractiveFallbackProvider.ts's no-LLM fallback recognizes
// and reuses exactly these bullet lines when no LLM is configured, so the
// bullet format here is load-bearing, not just cosmetic.

import type { PromptEvent } from "./types.js";

export function renderDailyStandupPrompt(events: PromptEvent[]): string {
  const eventLines = events
    .map((e) => `- ${e.type} | ${e.occurredAt} | ${e.embeddingText}`)
    .join("\n");

  return [
    "Summarize the developer's work from the events below into a 3-bullet standup update:",
    '"Yesterday / Today / Blockers" style. Be concrete (mention real file/project names',
    "from the events). Do not invent work not represented in the events.",
    "",
    "Events:",
    eventLines
  ].join("\n");
}
