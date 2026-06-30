// Redaction pipeline (spec §5.2, SEC-3): runs before persist AND before
// embedding generation. A secret must never reach SQLite, LanceDB, the
// embedding input text, the audit log, or any sync payload — even
// transiently. Every MemoryEvent passes through here on ingestion
// (POST /v1/events, spec §8.1) before any storage write.

import { findSecrets, redactText, type Finding } from "./rules.js";

export interface RedactionOutcome<T> {
  value: T;
  redacted: boolean;
  findingsCount: number;
}

// Recursively redacts every string leaf in an arbitrary JSON-shaped value
// (a MemoryEvent `payload` is `Record<string, unknown>` with type-specific
// shapes, spec §7.1) so redaction does not depend on knowing the payload's
// concrete type ahead of time.
function redactJsonValue(value: unknown): { value: unknown; count: number } {
  if (typeof value === "string") {
    const findings = findSecrets(value);
    return { value: redactText(value, findings), count: findings.length };
  }
  if (Array.isArray(value)) {
    let count = 0;
    const redactedArray = value.map((item) => {
      const result = redactJsonValue(item);
      count += result.count;
      return result.value;
    });
    return { value: redactedArray, count };
  }
  if (value !== null && typeof value === "object") {
    let count = 0;
    const redactedObject: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const result = redactJsonValue(nested);
      count += result.count;
      redactedObject[key] = result.value;
    }
    return { value: redactedObject, count };
  }
  return { value, count: 0 };
}

export function redactPayload(
  payload: Record<string, unknown>
): RedactionOutcome<Record<string, unknown>> {
  const { value, count } = redactJsonValue(payload);
  return { value: value as Record<string, unknown>, redacted: count > 0, findingsCount: count };
}

export function redactEmbeddingText(embeddingText: string): RedactionOutcome<string> {
  const findings = findSecrets(embeddingText);
  return {
    value: redactText(embeddingText, findings),
    redacted: findings.length > 0,
    findingsCount: findings.length
  };
}

export interface RedactableEvent {
  payload: Record<string, unknown>;
  embeddingText: string;
}

export interface RedactedEvent<T extends RedactableEvent> {
  event: T;
  redacted: boolean;
}

// Applies the pipeline to everything on a MemoryEvent that can carry
// free-text content the user typed or that was scraped from a page/
// terminal — the only two fields capture surfaces are required to fill
// with raw text (spec §7.1).
export function redactMemoryEvent<T extends RedactableEvent>(event: T): RedactedEvent<T> {
  const payloadResult = redactPayload(event.payload);
  const embeddingTextResult = redactEmbeddingText(event.embeddingText);
  return {
    event: {
      ...event,
      payload: payloadResult.value,
      embeddingText: embeddingTextResult.value
    },
    redacted: payloadResult.redacted || embeddingTextResult.redacted
  };
}

// Backs POST /v1/redaction/test (spec §8.1, FR-12) — lets a user verify the
// pipeline against arbitrary pasted text without persisting anything.
export interface RedactionTestResult {
  redacted: string;
  findings: Finding[];
}

export function testRedaction(text: string): RedactionTestResult {
  const findings = findSecrets(text);
  return { redacted: redactText(text, findings), findings };
}
