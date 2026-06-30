// File save diff capture (spec FR-2): a diff against the previous saved
// version, never the full file content, plus language id and project
// identifier. Respects global pause and the per-project denylist (FR-26).

import * as vscode from "vscode";
import type { AgentClient, SettingsCache } from "../agentClient.js";
import { buildFileDiff, countChangedLines } from "./diffUtils.js";

// Bounds memory use for long sessions that touch many distinct files —
// each tracked document only costs its last-saved text.
const MAX_TRACKED_DOCUMENTS = 500;

export function registerFileEditCapture(
  context: vscode.ExtensionContext,
  client: AgentClient,
  settings: SettingsCache,
  deviceId: string
): void {
  const baseline = new Map<string, string>();

  const seed = (document: vscode.TextDocument): void => {
    if (document.uri.scheme !== "file") return;
    const key = document.uri.toString();
    if (!baseline.has(key)) {
      baseline.set(key, document.getText());
    }
  };

  vscode.workspace.textDocuments.forEach(seed);
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(seed));

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      void handleSave(document, baseline, client, settings, deviceId);
    })
  );
}

async function handleSave(
  document: vscode.TextDocument,
  baseline: Map<string, string>,
  client: AgentClient,
  settings: SettingsCache,
  deviceId: string
): Promise<void> {
  if (document.uri.scheme !== "file") return;

  const current = settings.get();
  if (current.capturePaused) return;

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const repoRoot = workspaceFolder?.uri.fsPath;
  if (repoRoot && current.projectDenylist.includes(repoRoot)) return;

  const key = document.uri.toString();
  const previous = baseline.get(key) ?? "";
  const next = document.getText();
  baseline.set(key, next);
  if (baseline.size > MAX_TRACKED_DOCUMENTS) {
    const oldestKey = baseline.keys().next().value;
    if (oldestKey !== undefined) baseline.delete(oldestKey);
  }

  if (previous === next) return; // e.g. a save with no actual text change

  const relativePath = workspaceFolder
    ? vscode.workspace.asRelativePath(document.uri, false)
    : document.uri.fsPath;
  const { added, removed } = countChangedLines(previous, next);
  const diff = buildFileDiff(relativePath, previous, next);

  try {
    await client.postEvent({
      tenantId: "local",
      deviceId,
      source: "vscode",
      type: "file_edit",
      occurredAt: new Date().toISOString(),
      project: repoRoot ? { repoRoot } : undefined,
      context: { filePath: relativePath, language: document.languageId },
      payload: { diff, addedLines: added, removedLines: removed },
      embeddingText: `file_edit | ${relativePath} | +${added}/-${removed}`
    });
  } catch (err) {
    console.error("Recall: failed to capture file edit", err);
  }
}
