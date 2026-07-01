// Wraps GenerationProvider.generate with a fallback (spec §6.1 graceful
// degradation): even a provider that passed isAvailable() earlier can
// fail mid-session (e.g. Ollama exits between the availability check at
// startup and a job running hours later), so every call site goes through
// here rather than calling generate() directly.

import { ExtractiveFallbackProvider } from "./extractiveFallbackProvider.js";
import type { GenerationProvider } from "./provider.js";

const fallbackProvider = new ExtractiveFallbackProvider();

export async function safeGenerate(
  provider: GenerationProvider,
  prompt: string,
  fallback: GenerationProvider = fallbackProvider
): Promise<string> {
  try {
    return await provider.generate(prompt);
  } catch (err) {
    console.error(
      `Recall: ${provider.name} generation failed, falling back to ${fallback.name}`,
      err
    );
    return fallback.generate(prompt);
  }
}
