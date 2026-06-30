// Extension entrypoint (spec §13 Phase 2). Wires agentSupervisor, every
// capture/* module, and ui/* together. This file (and everything it pulls
// in transitively) imports `vscode`, so it can only be exercised by
// actually running the extension — there's no vitest-testable surface
// left here; the testable logic lives one layer down (agentClient,
// diffUtils, terminalUtils, sidebarFormat, statusBarFormat), each with its
// own unit tests.

import * as vscode from "vscode";
import { SettingsCache } from "./agentClient.js";
import { ensureAgentRunning } from "./agentSupervisor.js";
import { registerFileEditCapture } from "./capture/fileEdits.js";
import { registerManualCapture } from "./capture/manual.js";
import { registerTerminalCapture } from "./capture/terminal.js";
import { maybeShowWalkthrough } from "./onboarding/walkthrough.js";
import { registerSidebar } from "./ui/sidebarPanel.js";
import { registerStatusBar } from "./ui/statusBarItem.js";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("Recall");
  context.subscriptions.push(output);
  output.appendLine("Recall extension activating...");

  const client = await ensureAgentRunning(output);
  if (!client) {
    output.appendLine(
      "Recall activated without a connected Local Agent — capture is disabled for this session."
    );
    return;
  }

  const settings = new SettingsCache(client);
  await settings.refresh();

  const deviceId = vscode.env.machineId;

  registerFileEditCapture(context, client, settings, deviceId);
  registerTerminalCapture(context, client, settings, deviceId);
  registerManualCapture(context, client, deviceId);
  registerSidebar(context, client);
  registerStatusBar(context, client, settings);

  await maybeShowWalkthrough(context);

  output.appendLine("Recall extension activated.");
}

export function deactivate(): void {
  // Capture listeners are disposed automatically via context.subscriptions.
  // The Local Agent process is intentionally left running (spec §6.7) —
  // it's a shared daemon other windows or the browser extension may still
  // be using, not something this extension instance owns exclusively.
}
