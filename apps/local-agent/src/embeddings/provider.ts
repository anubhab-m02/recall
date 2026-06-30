// Pluggable embedding provider interface (spec §11.1). Every vector must
// be stampable with the model name + dimension that produced it (spec
// §7.6, §6.4.1) — vectors are only ever comparable within one model.

export interface EmbeddingProvider {
  readonly modelName: string;
  readonly dimension: number;
  embed(text: string): Promise<number[]>;
}
