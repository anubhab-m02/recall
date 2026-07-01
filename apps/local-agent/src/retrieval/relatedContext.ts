// Proactive surfacing (spec §11.3): given the file the user is currently
// looking at and/or the latest error text, run the same hybrid retrieval
// used for explicit search, restricted to a small top-k, so the VS Code
// sidebar can show "related past memories" without the user typing a query.

import type { MemoryEvent } from "@recall/shared-types";
import { hybridSearch, type HybridSearchDeps } from "./hybridSearch.js";

const DEFAULT_TOP_K = 3;

export interface RelatedContextOptions {
  tenantId: string;
  file?: string;
  errorText?: string;
  limit?: number;
}

export async function getRelatedContext(
  options: RelatedContextOptions,
  deps: HybridSearchDeps
): Promise<MemoryEvent[]> {
  const query = [options.file, options.errorText]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ");
  if (!query) return [];

  return hybridSearch(
    { tenantId: options.tenantId, query, limit: options.limit ?? DEFAULT_TOP_K },
    deps
  );
}
