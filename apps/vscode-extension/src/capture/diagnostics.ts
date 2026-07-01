// Diagnostics transition capture via vscode.languages.onDidChangeDiagnostics
// (spec FR-5): fires a diagnostic_resolved event the moment a previously
// tracked error/warning stops being reported for a file. Respects global
// pause and the per-project denylist (FR-26).

import * as vscode from "vscode";
import type { AgentClient, SettingsCache } from "../agentClient.js";
import {
  computeResolvedDiagnostics,
  diagnosticKey,
  severityLabel,
  type CurrentDiagnostic,
  type TrackedDiagnostic
} from "./diagnosticsUtils.js";

export function registerDiagnosticsCapture(
  context: vscode.ExtensionContext,
  client: AgentClient,
  settings: SettingsCache,
  deviceId: string
): void {
  const tracked = new Map<string, Map<string, TrackedDiagnostic>>();

  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics((event) => {
      for (const uri of event.uris) {
        void handleUriChange(uri, tracked, client, settings, deviceId);
      }
    })
  );
}

async function handleUriChange(
  uri: vscode.Uri,
  tracked: Map<string, Map<string, TrackedDiagnostic>>,
  client: AgentClient,
  settings: SettingsCache,
  deviceId: string
): Promise<void> {
  if (uri.scheme !== "file") return;

  const key = uri.toString();
  const current: CurrentDiagnostic[] = vscode.languages
    .getDiagnostics(uri)
    .map((d) => {
      const severity = severityLabel(d.severity);
      if (!severity) return undefined;
      return {
        key: diagnosticKey(d.range.start.line, d.range.start.character, d.message),
        severity,
        message: d.message
      };
    })
    .filter((d): d is CurrentDiagnostic => d !== undefined);

  const previous = tracked.get(key) ?? new Map<string, TrackedDiagnostic>();
  const now = Date.now();
  const { next, resolved } = computeResolvedDiagnostics(previous, current, now);
  tracked.set(key, next);

  if (resolved.length === 0) return;
  if (settings.get().capturePaused) return;

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  const repoRoot = workspaceFolder?.uri.fsPath;
  if (repoRoot && settings.get().projectDenylist.includes(repoRoot)) return;

  const relativePath = workspaceFolder ? vscode.workspace.asRelativePath(uri, false) : uri.fsPath;

  for (const diagnostic of resolved) {
    try {
      await client.postEvent({
        tenantId: "local",
        deviceId,
        source: "vscode",
        type: "diagnostic_resolved",
        occurredAt: new Date().toISOString(),
        project: repoRoot ? { repoRoot } : undefined,
        context: { filePath: relativePath },
        payload: {
          filePath: relativePath,
          severity: diagnostic.severity,
          message: diagnostic.message,
          resolvedAfterMs: now - diagnostic.firstSeenAt
        },
        embeddingText: `diagnostic_resolved | ${relativePath} | ${diagnostic.message}`
      });
    } catch (err) {
      console.error("Recall: failed to capture resolved diagnostic", err);
    }
  }
}
