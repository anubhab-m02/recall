// "Ask Recall" panel wired to /v1/ask (spec FR-19), plus the daily
// standup and weekly summary panels (spec §13 Phase 6: "surface in a VS
// Code panel with a 'Copy' action"). Spec §12's file layout only lists
// askRecallPanel.ts under ui/ — there's no separate standup-panel file in
// the fixed contract — so all three generation-result webviews share this
// module and its buildGenerationPanelHtml/escapeHtml helpers.

import * as vscode from "vscode";
import type { AgentClient } from "../agentClient.js";
import { buildGenerationPanelHtml } from "./panelHtml.js";

function showGenerationPanel(viewType: string, title: string, draftText: string): void {
  const panel = vscode.window.createWebviewPanel(viewType, title, vscode.ViewColumn.Beside, {
    enableScripts: true
  });
  panel.webview.html = buildGenerationPanelHtml(title, draftText);
  panel.webview.onDidReceiveMessage((message: { type?: string; text?: string }) => {
    if (message.type === "copy" && message.text) {
      void vscode.env.clipboard.writeText(message.text);
      void vscode.window.showInformationMessage("Copied to clipboard.");
    }
  });
}

export function registerAskRecallPanel(
  context: vscode.ExtensionContext,
  client: AgentClient
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("recall.askRecall", async () => {
      const question = await vscode.window.showInputBox({
        prompt: "Ask your Recall memory",
        placeHolder: "e.g. how did I configure the staging DB connection pool last time?",
        ignoreFocusOut: true
      });
      if (!question) return;

      try {
        const { answer, citations } = await client.ask(question);
        const citationLines = citations
          .map((c) => `[${c.id}] (${c.type}, ${c.occurredAt})`)
          .join("\n");
        const body = citationLines ? `${answer}\n\nCitations:\n${citationLines}` : answer;
        showGenerationPanel("recall.askRecall", "Ask Recall", body);
      } catch (err) {
        void vscode.window.showErrorMessage(`Recall: ask failed (${(err as Error).message}).`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("recall.showDailyStandup", async () => {
      try {
        const standup = await client.getStandup();
        showGenerationPanel(
          "recall.dailyStandup",
          `Daily Standup — ${standup.date}`,
          standup.draftText
        );
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Recall: standup generation failed (${(err as Error).message}).`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("recall.showWeeklySummary", async () => {
      try {
        const summary = await client.getWeeklySummary();
        showGenerationPanel(
          "recall.weeklySummary",
          `Weekly Summary — week of ${summary.weekOf}`,
          summary.draftText
        );
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Recall: weekly summary generation failed (${(err as Error).message}).`
        );
      }
    })
  );
}
