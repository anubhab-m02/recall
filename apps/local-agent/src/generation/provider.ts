// Pluggable generation provider interface (spec §11.5), shared by RAG,
// standup, weekly summary, and lesson synthesis. Every AI feature calls
// through this interface rather than a specific model, so swapping
// Ollama/Anthropic/extractive-only never touches job/retrieval code (spec
// §6.1: no external dependency may be a hard requirement).

export interface GenerationProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  generate(prompt: string): Promise<string>;
}

// Picks the first available provider from a preference-ordered list.
// Callers should always include an always-available fallback (e.g.
// ExtractiveFallbackProvider) last, so this never leaves a feature with no
// provider at all (spec §6.1 graceful degradation).
export async function resolveGenerationProvider(
  candidates: readonly GenerationProvider[]
): Promise<GenerationProvider> {
  for (const candidate of candidates) {
    if (await candidate.isAvailable()) return candidate;
  }
  const last = candidates[candidates.length - 1];
  if (!last) throw new Error("resolveGenerationProvider: no candidates given");
  return last;
}
