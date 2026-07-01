// RAG "Ask Recall" prompt (spec Appendix A, FR-19). Rendered as a plain
// string rather than through a templating engine — the Appendix A
// `{{#each}}` syntax is illustrative, not a mandated dependency, and a
// direct string builder is trivially unit-testable without adding a
// Handlebars-style runtime for four call sites. Memory lines are prefixed
// with "- " like every other template here so
// generation/extractiveFallbackProvider.ts's bullet-line extraction works
// for RAG ask too, not just standup/weekly/lesson.

import type { PromptMemory } from "./types.js";

export function renderAskRecallPrompt(question: string, memories: PromptMemory[]): string {
  const memoryLines = memories
    .map((m) => `- [${m.id}] (${m.type}, ${m.occurredAt}): ${m.embeddingText}`)
    .join("\n");

  return [
    "You are answering a developer's question using ONLY the memories provided below,",
    "which come from their own past work. Cite the memory id for every claim.",
    "If the memories don't contain an answer, say so plainly — do not guess.",
    "",
    `Question: ${question}`,
    "",
    "Memories:",
    memoryLines,
    "",
    "Answer, with inline citations like [mem_abc123]:"
  ].join("\n");
}
