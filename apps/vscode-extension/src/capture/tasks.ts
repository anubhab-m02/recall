// Task/build/test run capture via vscode.tasks.onDidEndTaskProcess (spec
// FR-6). Respects global pause and the per-project denylist (FR-26).

import * as vscode from "vscode";
import type { AgentClient, SettingsCache } from "../agentClient.js";
import { buildTaskRunEmbeddingText } from "./taskUtils.js";

export function registerTaskCapture(
  context: vscode.ExtensionContext,
  client: AgentClient,
  settings: SettingsCache,
  deviceId: string
): void {
  context.subscriptions.push(
    vscode.tasks.onDidEndTaskProcess((event) => {
      void handleEnd(event, client, settings, deviceId);
    })
  );
}

async function handleEnd(
  event: vscode.TaskProcessEndEvent,
  client: AgentClient,
  settings: SettingsCache,
  deviceId: string
): Promise<void> {
  if (settings.get().capturePaused) return;

  const task = event.execution.task;
  const scope = task.scope;
  const workspaceFolder =
    scope && typeof scope === "object" && "uri" in scope
      ? (scope as vscode.WorkspaceFolder)
      : undefined;
  const repoRoot = workspaceFolder?.uri.fsPath;
  if (repoRoot && settings.get().projectDenylist.includes(repoRoot)) return;

  const taskName = task.name;
  const taskType = typeof task.definition.type === "string" ? task.definition.type : undefined;
  const exitCode = event.exitCode;

  try {
    await client.postEvent({
      tenantId: "local",
      deviceId,
      source: "vscode",
      type: "task_run",
      occurredAt: new Date().toISOString(),
      project: repoRoot ? { repoRoot } : undefined,
      payload: { taskName, taskType, exitCode },
      embeddingText: buildTaskRunEmbeddingText(taskName, exitCode)
    });
  } catch (err) {
    console.error("Recall: failed to capture task run", err);
  }
}
