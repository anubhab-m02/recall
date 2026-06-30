// Hybrid retrieval (spec §11.2): combines vector cosine similarity,
// keyword/FTS-style overlap (catches exact identifiers embeddings can
// blur — error codes, function names), and recency decay. Explicit graph
// links and usefulnessScore feedback boosts (also listed in §11.2) aren't
// wired in yet: Lessons (which carry usefulnessScore) don't exist until
// Phase 6, and there's no "currently viewed" context to link against
// until Phase 4's proactiveContext.ts — both are natural additions once
// their backing features land, not core to this phase's DoD.

import type { MemoryEvent } from "@recall/shared-types";
import type { EmbeddingProvider } from "../embeddings/provider.js";
import type { LanceDbStore } from "../storage/lancedb.js";

const WEIGHT_VECTOR = 0.6;
const WEIGHT_KEYWORD = 0.3;
const WEIGHT_RECENCY = 0.1;
const RECENCY_HALF_LIFE_DAYS = 30;
const MS_PER_DAY = 86_400_000;
const DEFAULT_LIMIT = 20;

export interface HybridSearchOptions {
  tenantId: string;
  query?: string;
  type?: string;
  project?: string;
  since?: string;
  limit?: number;
}

export interface HybridSearchDeps {
  lancedb: LanceDbStore;
  embeddings: EmbeddingProvider;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function keywordOverlapScore(query: string, event: MemoryEvent): number {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 0;
  const haystack = [event.embeddingText, ...event.tags, JSON.stringify(event.payload)]
    .join(" ")
    .toLowerCase();
  const matched = terms.filter((term) => haystack.includes(term)).length;
  return matched / terms.length;
}

export function recencyScore(occurredAt: string, pinned: boolean, now = Date.now()): number {
  if (pinned) return 1; // spec §11.2: "no decay for pinned items or Lessons"
  const ageDays = (now - new Date(occurredAt).getTime()) / MS_PER_DAY;
  if (!Number.isFinite(ageDays) || ageDays < 0) return 1;
  return Math.exp((-Math.LN2 * ageDays) / RECENCY_HALF_LIFE_DAYS);
}

export async function hybridSearch(
  options: HybridSearchOptions,
  deps: HybridSearchDeps
): Promise<MemoryEvent[]> {
  const candidates = await deps.lancedb.scanEventsForSearch({
    tenantId: options.tenantId,
    type: options.type,
    project: options.project,
    since: options.since
  });

  let queryEmbedding: number[] | undefined;
  if (options.query) {
    try {
      queryEmbedding = await deps.embeddings.embed(options.query);
    } catch (err) {
      // Vector scoring degrades to keyword + recency only (spec §6.1) —
      // an embedding failure must never make search itself fail.
      console.error("Recall: query embedding failed, falling back to keyword+recency", err);
    }
  }

  const now = Date.now();
  const scored = candidates.map((event) => {
    const vectorScore =
      queryEmbedding && event.embedding && event.embeddingModel === deps.embeddings.modelName
        ? cosineSimilarity(queryEmbedding, event.embedding)
        : 0;
    const keywordScore = options.query ? keywordOverlapScore(options.query, event) : 0;
    const recency = recencyScore(event.occurredAt, event.privacy.pinned, now);

    const score =
      WEIGHT_VECTOR * vectorScore + WEIGHT_KEYWORD * keywordScore + WEIGHT_RECENCY * recency;
    return { event, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, options.limit ?? DEFAULT_LIMIT).map((s) => s.event);
}
