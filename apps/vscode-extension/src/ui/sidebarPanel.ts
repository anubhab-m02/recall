// Sidebar tree view of recent memories, with a search command wired to
// /v1/search (spec §13 Phase 2/3). The endpoint is an interim keyword
// search until Phase 3 swaps in real hybrid retrieval behind the same
// contract (see apps/local-agent/src/storage/lancedb.ts searchEvents).

import * as vscode from "vscode";
import type { MemoryEvent } from "@recall/shared-types";
import type { AgentClient } from "../agentClient.js";
import {
  formatMemoryDescription,
  formatMemoryLabel,
  resolveEventFilePath
} from "./sidebarFormat.js";

// No WS push channel exists yet (spec §8.1 /v1/stream is unimplemented —
// it isn't required until a later phase), so the sidebar refreshes on a
// light timer in addition to the explicit triggers (manual refresh and
// search). 10s keeps "visible within a few seconds" true (Phase 2 DoD)
// without polling the agent aggressively.
const AUTO_REFRESH_INTERVAL_MS = 10_000;

class MemoryTreeItem extends vscode.TreeItem {
  constructor(event: MemoryEvent, fallbackWorkspaceRoot: string | undefined) {
    super(formatMemoryLabel(event), vscode.TreeItemCollapsibleState.None);
    this.description = formatMemoryDescription(event);
    this.tooltip = event.embeddingText;
    this.contextValue = event.type;

    const filePath = resolveEventFilePath(event, fallbackWorkspaceRoot);
    if (filePath) {
      this.command = {
        command: "vscode.open",
        title: "Open",
        arguments: [vscode.Uri.file(filePath)]
      };
    }
  }
}

export class RecallSidebarProvider implements vscode.TreeDataProvider<MemoryTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private query: string | undefined;
  private items: MemoryEvent[] = [];

  constructor(private readonly client: AgentClient) {}

  setQuery(query: string | undefined): void {
    this.query = query;
    void this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      const { results } = await this.client.search({ q: this.query, limit: 50 });
      this.items = results;
    } catch (err) {
      console.error("Recall: failed to refresh sidebar", err);
    }
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: MemoryTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): MemoryTreeItem[] {
    const fallbackRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return this.items.map((event) => new MemoryTreeItem(event, fallbackRoot));
  }
}

export function registerSidebar(
  context: vscode.ExtensionContext,
  client: AgentClient
): RecallSidebarProvider {
  const provider = new RecallSidebarProvider(client);
  context.subscriptions.push(vscode.window.registerTreeDataProvider("recall.sidebar", provider));

  context.subscriptions.push(
    vscode.commands.registerCommand("recall.searchMemory", async () => {
      const query = await vscode.window.showInputBox({
        prompt: "Search your Recall memory",
        placeHolder: "e.g. jest timeout, staging db connection pool"
      });
      if (query === undefined) return; // cancelled, leave the current view as-is
      provider.setQuery(query || undefined);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("recall.refreshSidebar", () => void provider.refresh())
  );

  const interval = setInterval(() => void provider.refresh(), AUTO_REFRESH_INTERVAL_MS);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });

  void provider.refresh();
  return provider;
}
