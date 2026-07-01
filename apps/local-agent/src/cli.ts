#!/usr/bin/env node
// `recall-agent start|mcp|status` CLI entrypoint (spec §9, §13 Phase 1).

import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readDiscoveryFile } from "./agentLifecycle.js";
import { startAgent, stopAgent, type RunningAgent } from "./agent.js";
import { SingleInstanceLockError } from "./agentLifecycle.js";
import { NoAgentRunningError } from "./mcp/agentHttpClient.js";
import { startMcpServer } from "./mcp/server.js";

async function runStart(): Promise<number> {
  let agent: RunningAgent;
  try {
    agent = await startAgent();
  } catch (err) {
    if (err instanceof SingleInstanceLockError) {
      console.error(`Local Agent is already running (pid ${err.existingPid}).`);
      return 0;
    }
    console.error(err);
    return 1;
  }

  console.log(`Recall Local Agent listening on http://127.0.0.1:${agent.port}`);
  console.log(
    `Dashboard: http://127.0.0.1:${agent.port}/dashboard/dashboard.html?token=${agent.token}`
  );

  const shutdown = async (): Promise<void> => {
    await stopAgent(agent);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  return 0;
}

async function runStatus(): Promise<number> {
  const discovery = readDiscoveryFile();
  if (!discovery) {
    console.log("Local Agent is not running.");
    return 1;
  }
  try {
    const res = await fetch(`http://127.0.0.1:${discovery.port}/v1/health`);
    if (res.ok) {
      console.log(`Local Agent is running (pid ${discovery.pid}, port ${discovery.port}).`);
      return 0;
    }
  } catch {
    // Falls through to the "not responding" message below.
  }
  console.log("Local Agent discovery file is stale; the agent is not responding.");
  return 1;
}

async function runMcp(): Promise<number> {
  // stdio IS the JSON-RPC transport here (spec §8.1: "recall-agent mcp"
  // runs as an MCP server over stdio) — nothing may write to stdout
  // outside the MCP SDK itself, so diagnostics go to stderr only.
  try {
    await startMcpServer();
  } catch (err) {
    if (err instanceof NoAgentRunningError) {
      console.error(err.message);
      return 1;
    }
    console.error(err);
    return 1;
  }
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  const command = argv[2];
  if (command === "start") return runStart();
  if (command === "status") return runStatus();
  if (command === "mcp") return runMcp();
  return 1;
}

// Compares realpath-resolved paths rather than raw strings/URLs, for two
// independent reasons a naive comparison silently fails on:
//   1. `import.meta.url` percent-encodes characters like spaces (common in
//      real install paths) while `process.argv[1]` does not.
//   2. A globally-linked/installed CLI (`npm install -g`, `pnpm link
//      --global`, or the `bin` field in package.json) runs through a
//      symlink: `process.argv[1]` is the symlink path, but
//      `import.meta.url` resolves through the realpath of the target file
//      — so without realpath-resolving both sides, this never matches for
//      any real installed instance of this CLI, only a direct `node
//      dist/cli.js` invocation.
function isDirectlyExecuted(): boolean {
  const argvPath = process.argv[1];
  if (!argvPath || !existsSync(argvPath)) return false;
  return fileURLToPath(import.meta.url) === realpathSync(argvPath);
}

if (isDirectlyExecuted()) {
  main(process.argv).then((code) => {
    if (code !== 0) process.exitCode = code;
  });
}
