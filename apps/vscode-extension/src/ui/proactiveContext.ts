// Proactive surfacing (spec §11.3): on a debounced trigger — active editor
// change, new diagnostics on the active file, or a terminal command
// failure — calls /v1/context/related with the current file path and
// latest error text, and pushes results into the sidebar without the user
// typing an explicit query.

import * as vscode from "vscode";
import type { AgentClient } from "../agentClient.js";
import type { ProactiveTrigger } from "./proactiveTrigger.js";
import type { RecallSidebarProvider } from "./sidebarPanel.js";

const DEBOUNCE_MS = 500;

function relativePath(uri: vscode.Uri): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  return workspaceFolder ? vscode.workspace.asRelativePath(uri, false) : uri.fsPath;
}

export function registerProactiveContext(
  context: vscode.ExtensionContext,
  client: AgentClient,
  sidebar: RecallSidebarProvider,
  proactiveTrigger: ProactiveTrigger
): void {
  let lastErrorText: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const run = async (file: string | undefined): Promise<void> => {
    if (!file && !lastErrorText) return;
    try {
      const { results } = await client.getRelatedContext({ file, errorText: lastErrorText });
      if (results.length > 0) sidebar.setRelatedResults(results);
    } catch (err) {
      console.error("Recall: failed to fetch proactive related context", err);
    }
  };

  const scheduleTrigger = (file: string | undefined): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(file), DEBOUNCE_MS);
  };

  const activeFile = (): string | undefined => {
    const editor = vscode.window.activeTextEditor;
    return editor && editor.document.uri.scheme === "file"
      ? relativePath(editor.document.uri)
      : undefined;
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => scheduleTrigger(activeFile()))
  );

  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics((event) => {
      const activeUri = vscode.window.activeTextEditor?.document.uri;
      if (!activeUri || !event.uris.some((uri) => uri.toString() === activeUri.toString())) return;
      scheduleTrigger(activeFile());
    })
  );

  context.subscriptions.push(
    proactiveTrigger.onTerminalFailure((errorText) => {
      lastErrorText = errorText;
      scheduleTrigger(activeFile());
    })
  );

  context.subscriptions.push({ dispose: () => timer && clearTimeout(timer) });
}
