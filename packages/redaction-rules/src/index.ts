// Rule-based secret detectors (spec §5.2, SEC-3): regex for JWTs/API
// keys/.env patterns + an entropy heuristic catch-all. Pure, side-effect
// free — the Local Agent's redaction pipeline (apps/local-agent/src/
// redaction/pipeline.ts) is responsible for *when* this runs (before
// persist and before embedding) and for audit logging.

import { findHighEntropyTokens } from "./entropy.js";
import { ALL_PATTERN_RULES } from "./patterns.js";
import type { Finding } from "./types.js";

export * from "./types.js";
export * from "./entropy.js";
export * from "./patterns.js";

function mergeFindings(findings: Finding[]): Finding[] {
  // Prefer earlier, longer matches; drop anything that overlaps a match
  // already accepted (e.g. a JWT segment that also looks high-entropy).
  const sorted = [...findings].sort((a, b) => a.index - b.index || b.length - a.length);
  const merged: Finding[] = [];
  let lastEnd = -1;
  for (const finding of sorted) {
    if (finding.index >= lastEnd) {
      merged.push(finding);
      lastEnd = finding.index + finding.length;
    }
  }
  return merged;
}

export function findSecrets(text: string): Finding[] {
  const findings = ALL_PATTERN_RULES.flatMap((rule) => rule.detect(text));
  findings.push(...findHighEntropyTokens(text));
  return mergeFindings(findings);
}

export function redactText(text: string, findings: Finding[] = findSecrets(text)): string {
  if (findings.length === 0) return text;
  const sorted = [...findings].sort((a, b) => a.index - b.index);
  let result = "";
  let cursor = 0;
  for (const finding of sorted) {
    result += text.slice(cursor, finding.index);
    result += `[REDACTED:${finding.rule}]`;
    cursor = finding.index + finding.length;
  }
  result += text.slice(cursor);
  return result;
}
