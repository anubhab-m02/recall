// RAG "Ask Recall" flow (spec §11.4, FR-19): retrieve top-k relevant
// memories via the same hybrid search used for explicit search, then ask
// the generation provider to synthesize a cited answer. Extractive
// fallback (spec §11.4: "just return the most relevant raw excerpts
// unsummarized") kicks in automatically via safeGenerate/
// ExtractiveFallbackProvider, so this never hard-fails just because no
// LLM is configured.

import { renderAskRecallPrompt } from "@recall/prompt-templates";
import type { MemoryEvent } from "@recall/shared-types";
import { safeGenerate } from "../generation/safeGenerate.js";
import type { GenerationProvider } from "../generation/provider.js";
import { hybridSearch, type HybridSearchDeps } from "./hybridSearch.js";

const DEFAULT_TOP_K = 6;

export interface MemoryRef {
  id: string;
  type: string;
  occurredAt: string;
}

export interface AskResult {
  answer: string;
  citations: MemoryRef[];
}

export interface RagAskDeps extends HybridSearchDeps {
  provider: GenerationProvider;
}

export async function ragAsk(
  tenantId: string,
  question: string,
  deps: RagAskDeps,
  limit: number = DEFAULT_TOP_K
): Promise<AskResult> {
  const memories: MemoryEvent[] = await hybridSearch({ tenantId, query: question, limit }, deps);

  if (memories.length === 0) {
    return { answer: "I don't have a memory about that.", citations: [] };
  }

  const prompt = renderAskRecallPrompt(
    question,
    memories.map((m) => ({
      id: m.id,
      type: m.type,
      occurredAt: m.occurredAt,
      embeddingText: m.embeddingText
    }))
  );
  const answer = await safeGenerate(deps.provider, prompt);

  return {
    answer,
    citations: memories.map((m) => ({ id: m.id, type: m.type, occurredAt: m.occurredAt }))
  };
}
