// Shared input shapes for the prompt renderers (spec Appendix A). Kept
// intentionally minimal — just the fields each template actually
// interpolates — so callers can build them from a MemoryEvent/Lesson
// without this package depending on @recall/shared-types directly.

export interface PromptEvent {
  type: string;
  occurredAt: string;
  embeddingText: string;
}

export interface PromptMemory {
  id: string;
  type: string;
  occurredAt: string;
  embeddingText: string;
}

export interface PromptSummaryItem {
  label: string;
  occurredAt: string;
  text: string;
}
