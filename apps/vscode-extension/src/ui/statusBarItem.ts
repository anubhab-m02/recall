// Status bar pause/resume control (spec FR-25) — a single, fast control
// reachable from the status bar, kept in sync with the browser extension's
// toolbar toggle via the shared /v1/capture/pause|resume endpoints.

import * as vscode from "vscode";
import type { AgentClient, SettingsCache } from "../agentClient.js";
import { formatStatusBarState } from "./statusBarFormat.js";

export function registerStatusBar(
  context: vscode.ExtensionContext,
  client: AgentClient,
  settings: SettingsCache
): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.command = "recall.toggleCapturePause";
  context.subscriptions.push(item);

  const render = (): void => {
    const state = formatStatusBarState(settings.get().capturePaused);
    item.text = state.text;
    item.tooltip = state.tooltip;
  };
  render();
  item.show();

  context.subscriptions.push(
    vscode.commands.registerCommand("recall.toggleCapturePause", async () => {
      try {
        if (settings.get().capturePaused) {
          await client.resumeCapture();
        } else {
          await client.pauseCapture();
        }
        await settings.refresh();
        render();
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Recall: failed to toggle capture (${(err as Error).message}).`
        );
      }
    })
  );

  return item;
}
