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
import { registerDebugSessionCapture } from "./capture/debugSessions.js";
import { registerDiagnosticsCapture } from "./capture/diagnostics.js";
import { registerFileEditCapture } from "./capture/fileEdits.js";
import { registerGitCapture } from "./capture/git.js";
import { registerManualCapture } from "./capture/manual.js";
import { registerTaskCapture } from "./capture/tasks.js";
import { registerTerminalCapture } from "./capture/terminal.js";
import { maybeShowWalkthrough } from "./onboarding/walkthrough.js";
import { registerAskRecallPanel } from "./ui/askRecallPanel.js";
import { registerCodeLensProvider } from "./ui/codeLensProvider.js";
import { registerProactiveContext } from "./ui/proactiveContext.js";
import { ProactiveTrigger } from "./ui/proactiveTrigger.js";
import { registerSidebar } from "./ui/sidebarPanel.js";
import { registerStatusBar } from "./ui/statusBarItem.js";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("Recall");
  context.subscriptions.push(output);
  output.appendLine("Recall extension activating...");

  const client = await ensureAgentRunning(output, context.globalStorageUri.fsPath);
  if (!client) {
    output.appendLine(
      "Recall activated without a connected Local Agent — capture is disabled for this session."
    );
    return;
  }

  const settings = new SettingsCache(client);
  await settings.refresh();

  const deviceId = vscode.env.machineId;

  const proactiveTrigger = new ProactiveTrigger();
  context.subscriptions.push(proactiveTrigger);

  registerFileEditCapture(context, client, settings, deviceId);
  registerTerminalCapture(context, client, settings, deviceId, proactiveTrigger);
  registerManualCapture(context, client, deviceId);
  registerDebugSessionCapture(context, client, settings, deviceId);
  registerDiagnosticsCapture(context, client, settings, deviceId);
  registerGitCapture(context, client, settings, deviceId);
  registerTaskCapture(context, client, settings, deviceId);

  const sidebar = registerSidebar(context, client);
  registerStatusBar(context, client, settings);
  registerProactiveContext(context, client, sidebar, proactiveTrigger);
  registerCodeLensProvider(context, client);
  registerAskRecallPanel(context, client);

  await maybeShowWalkthrough(context);

  output.appendLine("Recall extension activated.");
}

export function deactivate(): void {
  // Capture listeners are disposed automatically via context.subscriptions.
  // The Local Agent process is intentionally left running (spec §6.7) —
  // it's a shared daemon other windows or the browser extension may still
  // be using, not something this extension instance owns exclusively.
}
