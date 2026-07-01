// On activation, checks /v1/health; if the Local Agent isn't running,
// spawns it as a detached child process (spec §13 Phase 2, §6.7, §13
// Phase 11). This is the only file allowed to mix `vscode` calls with
// agent-lifecycle logic — keep it thin and push anything testable into
// agentClient.ts / agentProvisioner.ts.
//
// Provisioning order on a machine with no `recall-agent` on PATH (Phase
// 11 DoD — no manual terminal steps): try the PATH-resident binary first
// (fast path for monorepo devs / anyone who already installed it
// globally), and only if that's missing, silently `npm install
// @recall/local-agent` into this extension's own global-storage
// directory (no admin rights needed — see agentProvisioner.ts) and spawn
// the freshly-installed copy directly with `node`.

import { existsSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import * as vscode from "vscode";
import { AgentClient, readDiscoveryFile, type AgentDiscovery } from "./agentClient.js";
import {
  nodeExecutableName,
  npmExecutableName,
  npmInstallArgs,
  provisionedCliPath
} from "./agentProvisioner.js";

const POLL_INTERVAL_MS = 300;
const STARTUP_TIMEOUT_MS = 10_000;
const INSTALL_TIMEOUT_MS = 120_000;

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

function spawnDetached(command: string, args: string[]): ChildProcess {
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
  return child;
}

async function trySpawnOnPath(output: vscode.OutputChannel): Promise<AgentDiscovery | undefined> {
  output.appendLine("Recall Local Agent not detected — spawning `recall-agent start`...");
  const child = spawnDetached("recall-agent", ["start"]);
  const errored = new Promise<boolean>((resolve) => {
    child.on("error", () => resolve(true));
    child.on("spawn", () => resolve(false));
  });
  if (await errored) return undefined;
  return waitForDiscovery(STARTUP_TIMEOUT_MS);
}

// Runs `npm install @recall/local-agent` into globalStorageDir/provisioned-agent
// (see agentProvisioner.ts), streaming its output to the Output channel so a
// slow/failed install is visible rather than a silent hang.
function provisionAgent(globalStorageDir: string, output: vscode.OutputChannel): Promise<boolean> {
  return new Promise((resolve) => {
    const npm = npmExecutableName();
    output.appendLine(`Recall is installing its Local Agent (\`${npm} install\`, one-time)...`);
    const child = spawn(npm, npmInstallArgs(globalStorageDir), { stdio: "pipe" });
    const timeout = setTimeout(() => {
      child.kill();
      resolve(false);
    }, INSTALL_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => output.append(chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => output.append(chunk.toString()));
    child.on("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      resolve(code === 0);
    });
  });
}

async function ensureProvisionedAndSpawn(
  globalStorageDir: string,
  output: vscode.OutputChannel
): Promise<AgentDiscovery | undefined> {
  let cliPath = provisionedCliPath(globalStorageDir);
  if (!existsSync(cliPath)) {
    const installed = await provisionAgent(globalStorageDir, output);
    if (!installed || !existsSync(cliPath)) {
      output.appendLine("Recall could not install its Local Agent automatically.");
      return undefined;
    }
  }
  cliPath = provisionedCliPath(globalStorageDir);
  output.appendLine("Recall is starting its provisioned Local Agent...");
  spawnDetached(nodeExecutableName(), [cliPath, "start"]);
  return waitForDiscovery(STARTUP_TIMEOUT_MS);
}

export async function ensureAgentRunning(
  output: vscode.OutputChannel,
  globalStorageDir: string
): Promise<AgentClient | undefined> {
  const existing = readDiscoveryFile();
  if (existing && (await AgentClient.health(existing.port))) {
    output.appendLine(`Recall Local Agent already running on port ${existing.port}.`);
    return new AgentClient(existing);
  }

  const onPath = await trySpawnOnPath(output);
  const discovery = onPath ?? (await ensureProvisionedAndSpawn(globalStorageDir, output));

  if (discovery) {
    output.appendLine(`Recall Local Agent ready on port ${discovery.port}.`);
    return new AgentClient(discovery);
  }

  void vscode.window.showErrorMessage(
    "Recall could not start its Local Agent automatically. Make sure Node.js is installed, " +
      'then run "Developer: Reload Window" to retry.'
  );
  return undefined;
}
