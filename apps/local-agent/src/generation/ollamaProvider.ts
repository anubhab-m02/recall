// Local Ollama generation provider (spec §9, §11.4/11.5's "Ollama local
// model preferred default"): auto-detected via Ollama's own HTTP API on
// its default port, never a hard dependency (spec §6.1) — isAvailable()
// is what lets resolveGenerationProvider() fall through to the extractive
// provider when Ollama isn't installed/running.

import type { GenerationProvider } from "./provider.js";

const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "llama3.2:3b";
const AVAILABILITY_TIMEOUT_MS = 1000;

export class OllamaProvider implements GenerationProvider {
  readonly name = "ollama";

  constructor(
    private readonly baseUrl: string = DEFAULT_BASE_URL,
    private readonly model: string = DEFAULT_MODEL
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(AVAILABILITY_TIMEOUT_MS)
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async generate(prompt: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, prompt, stream: false })
    });
    if (!res.ok) {
      throw new Error(`Ollama generate request failed: ${res.status}`);
    }
    const data = (await res.json()) as { response: string };
    return data.response;
  }
}
