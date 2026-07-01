// Debug session lifecycle capture (spec FR-3): records the launch config
// name and any exceptions hit during the session, on session termination.
// Respects global pause and the per-project denylist (FR-26).

import * as vscode from "vscode";
import type { AgentClient, SettingsCache } from "../agentClient.js";
import { buildDebugSessionEmbeddingText, type DebugException } from "./debugUtils.js";

// The Debug Adapter Protocol's "stopped" event body isn't part of VS Code's
// public DebugProtocolMessage type (which is intentionally opaque), so this
// narrows just the fields Recall reads off the raw DAP message.
interface StoppedEventMessage {
  type: "event";
  event: "stopped";
  body?: { reason?: string; text?: string; description?: string };
}

function isStoppedOnException(
  message: vscode.DebugProtocolMessage
): message is StoppedEventMessage {
  const candidate = message as Partial<StoppedEventMessage>;
  return (
    candidate.type === "event" &&
    candidate.event === "stopped" &&
    candidate.body?.reason === "exception"
  );
}

export function registerDebugSessionCapture(
  context: vscode.ExtensionContext,
  client: AgentClient,
  settings: SettingsCache,
  deviceId: string
): void {
  const exceptionsBySession = new Map<string, DebugException[]>();

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterTrackerFactory("*", {
      createDebugAdapterTracker(session) {
        return {
          onDidSendMessage(message) {
            if (!isStoppedOnException(message)) return;
            const list = exceptionsBySession.get(session.id) ?? [];
            list.push({
              message: message.body?.text ?? message.body?.description ?? "exception",
              stack: ""
            });
            exceptionsBySession.set(session.id, list);
          }
        };
      }
    })
  );

  context.subscriptions.push(
    vscode.debug.onDidTerminateDebugSession((session) => {
      void handleTerminate(session, exceptionsBySession, client, settings, deviceId);
    })
  );
}

async function handleTerminate(
  session: vscode.DebugSession,
  exceptionsBySession: Map<string, DebugException[]>,
  client: AgentClient,
  settings: SettingsCache,
  deviceId: string
): Promise<void> {
  const exceptions = exceptionsBySession.get(session.id);
  exceptionsBySession.delete(session.id);

  if (settings.get().capturePaused) return;

  const repoRoot = session.workspaceFolder?.uri.fsPath;
  if (repoRoot && settings.get().projectDenylist.includes(repoRoot)) return;

  try {
    await client.postEvent({
      tenantId: "local",
      deviceId,
      source: "vscode",
      type: "debug_session",
      occurredAt: new Date().toISOString(),
      project: repoRoot ? { repoRoot } : undefined,
      payload: { launchConfigName: session.name, exceptions },
      embeddingText: buildDebugSessionEmbeddingText(session.name, exceptions)
    });
  } catch (err) {
    console.error("Recall: failed to capture debug session", err);
  }
}
