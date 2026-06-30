import type { EmbeddingProvider } from "../../src/embeddings/provider.js";

// Always returns a zero vector — deliberately *not* semantically
// meaningful, by design. cosineSimilarity treats a zero vector as 0
// similarity (see hybridSearch.ts), so this fake contributes nothing to
// ranking and stays neutral: tests that exercise queueing/storage/HTTP
// wiring get deterministic keyword+recency-driven results without vector
// noise from an unrelated hash skewing the outcome. Tests that actually
// need to prove semantic retrieval works (or benchmark real search
// latency) must use the real TransformersJsEmbeddingProvider instead.
export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly modelName = "fake-test-model";
  readonly dimension: number;

  constructor(dimension = 8) {
    this.dimension = dimension;
  }

  async embed(_text: string): Promise<number[]> {
    return new Array(this.dimension).fill(0) as number[];
  }
}
