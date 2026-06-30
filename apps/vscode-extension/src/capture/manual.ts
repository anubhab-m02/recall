// `Recall: Save as memory` command (spec FR-7) — explicit capture for
// anything the passive capture surfaces miss, with optional tags.

import * as vscode from "vscode";
import type { AgentClient } from "../agentClient.js";

export function registerManualCapture(
  context: vscode.ExtensionContext,
  client: AgentClient,
  deviceId: string
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("recall.saveAsMemory", async () => {
      const content = await vscode.window.showInputBox({
        prompt: "What do you want Recall to remember?",
        placeHolder: "e.g. Fixed the flaky CORS test by mocking the clock",
        ignoreFocusOut: true
      });
      if (!content) return;

      const tagsInput = await vscode.window.showInputBox({
        prompt: "Tags (comma-separated, optional)",
        placeHolder: "e.g. cors, testing, flaky-test",
        ignoreFocusOut: true
      });
      const tags = tagsInput
        ? tagsInput
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [];

      const editor = vscode.window.activeTextEditor;
      const workspaceFolder = editor
        ? vscode.workspace.getWorkspaceFolder(editor.document.uri)
        : undefined;

      try {
        await client.postEvent({
          tenantId: "local",
          deviceId,
          source: "manual",
          type: "manual_note",
          occurredAt: new Date().toISOString(),
          project: workspaceFolder ? { repoRoot: workspaceFolder.uri.fsPath } : undefined,
          payload: { note: content },
          embeddingText: `manual_note | ${content}`,
          tags
        });
        void vscode.window.showInformationMessage("Saved to Recall.");
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Recall: failed to save memory (${(err as Error).message}).`
        );
      }
    })
  );
}
