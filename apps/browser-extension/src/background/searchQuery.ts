// Detects a search query issued on an allowlisted site (spec FR-8) from
// its URL's common query-string conventions. Heuristic, not exhaustive —
// sites that encode search terms outside the query string (e.g. path
// segments) aren't covered. Kept free of `chrome`/DOM globals so it's
// unit-testable.

const SEARCH_QUERY_PARAMS = ["q", "query", "search"];

export interface DetectedSearchQuery {
  engineOrSite: string;
  query: string;
}

export function extractSearchQuery(url: string): DetectedSearchQuery | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }

  for (const param of SEARCH_QUERY_PARAMS) {
    const value = parsed.searchParams.get(param);
    if (value && value.trim()) {
      return { engineOrSite: parsed.hostname, query: value.trim() };
    }
  }
  return undefined;
}
