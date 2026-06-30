import type { Finding } from "./types.js";

// Shannon entropy in bits/char — used as a catch-all heuristic for secrets
// that don't match a known vendor format (spec FR-11).
export function shannonEntropy(value: string): number {
  if (value.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of value) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

const TOKEN_PATTERN = /[A-Za-z0-9+=_.-]{20,}/g;
const MIN_ENTROPY_BITS_PER_CHAR = 3.3;
const MAX_PATH_LIKE_SEPARATORS = 2; // skip tokens that look like file paths

export function findHighEntropyTokens(text: string): Finding[] {
  const findings: Finding[] = [];
  for (const m of text.matchAll(TOKEN_PATTERN)) {
    const token = m[0];
    const separators = (token.match(/[/.]/g) ?? []).length;
    if (separators > MAX_PATH_LIKE_SEPARATORS) continue; // likely a path/URL, not a secret
    if (shannonEntropy(token) >= MIN_ENTROPY_BITS_PER_CHAR) {
      findings.push({
        rule: "high-entropy-token",
        index: m.index,
        length: token.length,
        match: token
      });
    }
  }
  return findings;
}
