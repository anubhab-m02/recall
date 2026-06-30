import type { EmbeddingProvider } from "../../src/embeddings/provider.js";

// Deterministic, fast, NOT semantically meaningful — only for tests that
// exercise queueing/storage/HTTP wiring. Tests that actually need to prove
// semantic retrieval works (or benchmark real search latency) must use the
// real TransformersJsEmbeddingProvider instead.
export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly modelName = "fake-test-model";
  readonly dimension: number;

  constructor(dimension = 8) {
    this.dimension = dimension;
  }

  async embed(text: string): Promise<number[]> {
    const vector = new Array(this.dimension).fill(0) as number[];
    for (let i = 0; i < text.length; i++) {
      vector[i % this.dimension] += text.charCodeAt(i);
    }
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vector.map((v) => v / norm);
  }
}
