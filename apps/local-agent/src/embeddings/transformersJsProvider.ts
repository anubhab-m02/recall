// Local embedding provider using Transformers.js with a quantized
// all-MiniLM-L6-v2 ONNX model (spec §9, §11.1) — pure JS/WASM/ONNX
// runtime, no Python dependency, fully offline once the model is cached.
//
// The model itself (~25MB quantized) is fetched from the Hugging Face Hub
// on first use and cached under ~/.recall/models so it survives
// `pnpm install`/node_modules churn and stays inside the documented
// per-user data directory rather than the package's own install path.

import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { join } from "node:path";
import { getRecallHome } from "../paths.js";
import type { EmbeddingProvider } from "./provider.js";

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
const DIMENSION = 384;

export class TransformersJsEmbeddingProvider implements EmbeddingProvider {
  readonly modelName = MODEL_NAME;
  readonly dimension = DIMENSION;

  private pipelinePromise: Promise<FeatureExtractionPipeline> | undefined;

  private async getPipeline(): Promise<FeatureExtractionPipeline> {
    if (!this.pipelinePromise) {
      env.cacheDir = join(getRecallHome(), "models");
      this.pipelinePromise = pipeline("feature-extraction", MODEL_NAME, {
        dtype: "q8"
      });
    }
    return this.pipelinePromise;
  }

  async embed(text: string): Promise<number[]> {
    const extractor = await this.getPipeline();
    const output = await extractor(text, { pooling: "mean", normalize: true });
    return Array.from(output.data as Float32Array);
  }
}
