// Lesson synthesis prompt (spec Appendix A, FR-15). Same "- type |
// occurredAt | embeddingText" bullet convention as dailyStandup.ts, so the
// extractive fallback can still extract event lines out of this prompt if
// asked to — though jobs/clusterIntoLessons.ts builds its own extractive
// Lesson directly from the source events rather than parsing this prompt,
// since the expected output here is JSON, not a bullet list.

import type { PromptEvent } from "./types.js";

export function renderLessonSynthesisPrompt(events: PromptEvent[]): string {
  const eventLines = events
    .map((e) => `- ${e.type} | ${e.occurredAt} | ${e.embeddingText}`)
    .join("\n");

  return [
    "The events below appear to be part of one debugging/problem-solving episode.",
    'Produce JSON: { "title": short string, "summary": 2-3 sentences,',
    '"whatWorked": string, "whatDidntWork": string|null }.',
    "Base this only on the events given.",
    "",
    "Events:",
    eventLines
  ].join("\n");
}
