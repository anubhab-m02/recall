// Status bar pause/resume control (spec FR-25) — a single, fast control
// reachable from the status bar, kept in sync with the browser extension's
// toolbar toggle via the shared /v1/capture/pause|resume endpoints.

import * as vscode from "vscode";
import type { AgentClient, SettingsCache } from "../agentClient.js";
import { AUTO_REFRESH_INTERVAL_MS } from "./sidebarPanel.js";
import { formatStatusBarState, startOfLocalDayIso } from "./statusBarFormat.js";

export function registerStatusBar(
  context: vscode.ExtensionContext,
  client: AgentClient,
  settings: SettingsCache
): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.command = "recall.toggleCapturePause";
  context.subscriptions.push(item);

  let todayCount: number | undefined;

  const render = (): void => {
    const state = formatStatusBarState(settings.get().capturePaused, todayCount);
    item.text = state.text;
    item.tooltip = state.tooltip;
  };
  render();
  item.show();

  // Ambient confirmation that passive capture is actually happening — file
  // saves, terminal commands, git activity, etc. are otherwise completely
  // silent, which was the concrete complaint that motivated this (a
  // first-time user has no visible proof anything is being captured at
  // all). Reuses the same /v1/search the sidebar already calls, so no new
  // backend endpoint is needed.
  const refreshCount = async (): Promise<void> => {
    try {
      const { results } = await client.search({ since: startOfLocalDayIso(), limit: 200 });
      todayCount = results.length;
      render();
    } catch {
      // Leave todayCount as-is (or undefined) — a transient failure here
      // shouldn't flip the status bar into an error state; the pause/resume
      // control itself surfaces real connectivity failures.
    }
  };
  void refreshCount();
  const interval = setInterval(() => void refreshCount(), AUTO_REFRESH_INTERVAL_MS);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });

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
