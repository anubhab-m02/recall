import type { GenerationProvider } from "../../src/generation/provider.js";

// A trivial provider for tests that just need *some* generation to
// happen without a real LLM — echoes back a fixed string (or a
// caller-supplied transform of the prompt) rather than parsing it.
export class FakeGenerationProvider implements GenerationProvider {
  readonly name = "fake-test-provider";

  constructor(private readonly output: string | ((prompt: string) => string) = "generated draft") {}

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generate(prompt: string): Promise<string> {
    return typeof this.output === "function" ? this.output(prompt) : this.output;
  }
}
