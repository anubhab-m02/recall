// On activation, checks /v1/health; if the Local Agent isn't running,
// spawns it as a detached child process (spec §13 Phase 2, §6.7). This is
// the only file allowed to mix `vscode` calls with agent-lifecycle logic —
// keep it thin and push anything testable into agentClient.ts.

import { spawn } from "node:child_process";
import * as vscode from "vscode";
import { AgentClient, readDiscoveryFile, type AgentDiscovery } from "./agentClient.js";

const POLL_INTERVAL_MS = 300;
const STARTUP_TIMEOUT_MS = 10_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDiscovery(timeoutMs: number): Promise<AgentDiscovery | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const discovery = readDiscoveryFile();
    if (discovery && (await AgentClient.health(discovery.port))) {
      return discovery;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return undefined;
}

export async function ensureAgentRunning(
  output: vscode.OutputChannel
): Promise<AgentClient | undefined> {
  const existing = readDiscoveryFile();
  if (existing && (await AgentClient.health(existing.port))) {
    output.appendLine(`Recall Local Agent already running on port ${existing.port}.`);
    return new AgentClient(existing);
  }

  output.appendLine("Recall Local Agent not detected — spawning `recall-agent start`...");
  let spawnError: Error | undefined;
  const child = spawn("recall-agent", ["start"], { detached: true, stdio: "ignore" });
  child.on("error", (err) => {
    spawnError = err;
  });
  child.unref();

  const discovery = await waitForDiscovery(STARTUP_TIMEOUT_MS);
  if (discovery) {
    output.appendLine(`Recall Local Agent ready on port ${discovery.port}.`);
    return new AgentClient(discovery);
  }

  if (spawnError) {
    void vscode.window.showErrorMessage(
      `Recall could not start its Local Agent (${spawnError.message}). Install it with ` +
        "`npm install -g @recall/local-agent` or ensure `recall-agent` is on your PATH, " +
        'then run "Developer: Reload Window".'
    );
  } else {
    void vscode.window.showErrorMessage(
      "Recall's Local Agent did not become ready in time. Capture is disabled for this session."
    );
  }
  return undefined;
}
