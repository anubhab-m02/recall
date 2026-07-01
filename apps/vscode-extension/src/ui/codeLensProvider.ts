// CodeLens "Similar past issue" annotations (spec §13 Phase 4): surfaces a
// clickable annotation above the first line of a file when Recall has a
// highly relevant past memory for it, opening that memory in the sidebar
// search on click.

import * as vscode from "vscode";
import type { MemoryEvent } from "@recall/shared-types";
import type { AgentClient } from "../agentClient.js";

// Only annotate genuinely close matches — this runs on every open/edit of
// every file, so a low bar would make the CodeLens noisy rather than useful.
const RELEVANCE_LIMIT = 1;

class RecallCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(private readonly client: AgentClient) {}

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    if (document.uri.scheme !== "file") return [];

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const file = workspaceFolder
      ? vscode.workspace.asRelativePath(document.uri, false)
      : document.uri.fsPath;

    let related: MemoryEvent[];
    try {
      ({ results: related } = await this.client.getRelatedContext({
        file,
        limit: RELEVANCE_LIMIT
      }));
    } catch {
      return [];
    }
    if (related.length === 0) return [];

    const match = related[0]!;
    const range = new vscode.Range(0, 0, 0, 0);
    return [
      new vscode.CodeLens(range, {
        title: `Recall: Similar past issue — ${match.embeddingText.slice(0, 60)}`,
        command: "recall.searchMemory",
        arguments: []
      })
    ];
  }
}

export function registerCodeLensProvider(
  context: vscode.ExtensionContext,
  client: AgentClient
): void {
  const provider = new RecallCodeLensProvider(client);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: "file" }, provider)
  );
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(() => provider.refresh()));
}
