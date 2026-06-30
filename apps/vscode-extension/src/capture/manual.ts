// `Recall: Save as memory` command (spec FR-7) — explicit capture for
// anything the passive capture surfaces miss, with optional tags. Also
// registers `Recall: Test Redaction` (spec FR-12, a MUST): users need a
// way to build trust in the redaction pipeline before they trust Recall
// with anything sensitive.

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

  const redactionOutput = vscode.window.createOutputChannel("Recall: Redaction Test");
  context.subscriptions.push(redactionOutput);

  context.subscriptions.push(
    vscode.commands.registerCommand("recall.testRedaction", async () => {
      const text = await vscode.window.showInputBox({
        prompt: "Paste text to test against Recall's redaction pipeline",
        placeHolder: "Try pasting a fake API key or .env line",
        ignoreFocusOut: true
      });
      if (!text) return;

      try {
        const result = await client.testRedaction(text);
        redactionOutput.clear();
        redactionOutput.appendLine("Input:");
        redactionOutput.appendLine(text);
        redactionOutput.appendLine("");
        redactionOutput.appendLine("Redacted:");
        redactionOutput.appendLine(result.redacted);
        redactionOutput.appendLine("");
        redactionOutput.appendLine(`Findings: ${JSON.stringify(result.findings, null, 2)}`);
        redactionOutput.show(true);
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Recall: redaction test failed (${(err as Error).message}).`
        );
      }
    })
  );
}
