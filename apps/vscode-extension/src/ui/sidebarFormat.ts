// Pure formatting helpers for the sidebar tree (spec §13 Phase 2). Kept
// free of `vscode` so the formatting logic is unit-testable.

import { join } from "node:path";
import type { MemoryEvent } from "@recall/shared-types";

const MAX_LABEL_LENGTH = 80;

export function formatMemoryLabel(event: Pick<MemoryEvent, "embeddingText">): string {
  const text = event.embeddingText.trim();
  return text.length > MAX_LABEL_LENGTH ? `${text.slice(0, MAX_LABEL_LENGTH - 1)}…` : text;
}

export function formatMemoryDescription(event: Pick<MemoryEvent, "type" | "occurredAt">): string {
  const date = new Date(event.occurredAt);
  const datePart = Number.isNaN(date.getTime()) ? event.occurredAt : date.toLocaleString();
  return `${event.type} · ${datePart}`;
}

// Resolves a clickable file path for an event, preferring the precise
// project.repoRoot the event was captured under over a guess at the
// currently open workspace folder (relevant once multiple repos are open).
export function resolveEventFilePath(
  event: Pick<MemoryEvent, "project" | "context">,
  fallbackWorkspaceRoot: string | undefined
): string | undefined {
  const filePath = event.context?.filePath;
  if (!filePath) return undefined;
  const root = event.project?.repoRoot ?? fallbackWorkspaceRoot;
  return root ? join(root, filePath) : undefined;
}
