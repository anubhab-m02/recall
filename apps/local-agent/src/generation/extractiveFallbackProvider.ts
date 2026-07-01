// Always-available extractive fallback (spec §6.1 principle 4, NFR-REL-1):
// ensures every AI feature has a no-LLM degraded path. Rather than
// summarizing, it returns the prompt's own event/lesson bullet lines
// unsummarized — spec §11.4 literally describes the RAG fallback as "just
// return the most relevant raw excerpts unsummarized," and dailyStandup/
// weeklySummary/lessonSynthesis prompt templates deliberately render every
// item as a "- ..." bullet line so this same extraction works for all of
// them without per-job-type logic here.

import type { GenerationProvider } from "./provider.js";

export class ExtractiveFallbackProvider implements GenerationProvider {
  readonly name = "extractive-fallback";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generate(prompt: string): Promise<string> {
    const bulletLines = prompt
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "));

    if (bulletLines.length === 0) {
      return "No relevant memories found.";
    }
    return bulletLines.join("\n");
  }
}
