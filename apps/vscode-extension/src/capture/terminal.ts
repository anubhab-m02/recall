// Terminal command capture via the VS Code Shell Integration API (spec
// FR-1): command text, cwd, exit code, truncated output. Respects global
// pause and the per-project denylist (FR-26).

import * as vscode from "vscode";
import type { AgentClient, SettingsCache } from "../agentClient.js";
import type { ProactiveTrigger } from "../ui/proactiveTrigger.js";
import { buildTerminalEmbeddingText, truncateOutput } from "./terminalUtils.js";

const MAX_OUTPUT_CHARS = 4000;

export function registerTerminalCapture(
  context: vscode.ExtensionContext,
  client: AgentClient,
  settings: SettingsCache,
  deviceId: string,
  proactiveTrigger?: ProactiveTrigger
): void {
  const buffers = new Map<vscode.TerminalShellExecution, string[]>();

  context.subscriptions.push(
    vscode.window.onDidStartTerminalShellExecution((event) => {
      const chunks: string[] = [];
      buffers.set(event.execution, chunks);
      void consumeOutput(event.execution, chunks);
    })
  );

  context.subscriptions.push(
    vscode.window.onDidEndTerminalShellExecution((event) => {
      void handleEnd(event, buffers, client, settings, deviceId, proactiveTrigger);
    })
  );
}

// Streams the command's output as it runs so the buffer is available by
// the time the end event fires (the stream may already be closed once a
// command has finished, so this can't be deferred to onDidEnd).
async function consumeOutput(
  execution: vscode.TerminalShellExecution,
  chunks: string[]
): Promise<void> {
  try {
    for await (const data of execution.read()) {
      chunks.push(data);
      const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      if (total > MAX_OUTPUT_CHARS * 2) {
        // We already have well more than the excerpt we'll keep — stop
        // holding the rest of a long-running command's output in memory.
        break;
      }
    }
  } catch {
    // The terminal can close mid-command; the command/exit-code info from
    // the end event is still worth capturing even without full output.
  }
}

async function handleEnd(
  event: vscode.TerminalShellExecutionEndEvent,
  buffers: Map<vscode.TerminalShellExecution, string[]>,
  client: AgentClient,
  settings: SettingsCache,
  deviceId: string,
  proactiveTrigger: ProactiveTrigger | undefined
): Promise<void> {
  const chunks = buffers.get(event.execution) ?? [];
  buffers.delete(event.execution);

  if (settings.get().capturePaused) return;

  const commandLine = event.execution.commandLine.value.trim();
  if (!commandLine) return;

  const cwdUri = event.execution.cwd;
  const workspaceFolder = cwdUri ? vscode.workspace.getWorkspaceFolder(cwdUri) : undefined;
  const repoRoot = workspaceFolder?.uri.fsPath;
  if (repoRoot && settings.get().projectDenylist.includes(repoRoot)) return;

  const exitCode = event.exitCode ?? -1;
  const outputExcerpt = truncateOutput(chunks, MAX_OUTPUT_CHARS);

  // Spec §11.3: a failing terminal command is one of the three proactive-
  // surfacing triggers, alongside active editor change and new diagnostics.
  if (exitCode !== 0) {
    proactiveTrigger?.notifyTerminalFailure(outputExcerpt || commandLine);
  }

  try {
    await client.postEvent({
      tenantId: "local",
      deviceId,
      source: "vscode",
      type: "terminal_command",
      occurredAt: new Date().toISOString(),
      project: repoRoot ? { repoRoot } : undefined,
      payload: { command: commandLine, cwd: cwdUri?.fsPath ?? "", exitCode, outputExcerpt },
      embeddingText: buildTerminalEmbeddingText(commandLine, exitCode)
    });
  } catch (err) {
    console.error("Recall: failed to capture terminal command", err);
  }
}
