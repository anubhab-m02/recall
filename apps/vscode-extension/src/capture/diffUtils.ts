// Pure diff helpers backing file-edit capture (spec FR-2: a diff, not the
// full file content). Kept free of `vscode` so it's unit-testable.

import { createPatch, diffLines } from "diff";

export interface LineDiffStats {
  added: number;
  removed: number;
}

export function countChangedLines(oldText: string, newText: string): LineDiffStats {
  const parts = diffLines(oldText, newText);
  let added = 0;
  let removed = 0;
  for (const part of parts) {
    if (!part.value) continue;
    const lineCount = part.value.endsWith("\n")
      ? part.value.split("\n").length - 1
      : part.value.split("\n").length;
    if (part.added) added += lineCount;
    if (part.removed) removed += lineCount;
  }
  return { added, removed };
}

export function buildFileDiff(filePath: string, oldText: string, newText: string): string {
  return createPatch(filePath, oldText, newText, "previous", "current");
}
