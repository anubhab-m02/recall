#!/usr/bin/env node
// `recall-agent start|mcp|status` CLI entrypoint (spec §9, §13 Phase 1).

import { fileURLToPath } from "node:url";
import { readDiscoveryFile } from "./agentLifecycle.js";
import { startAgent, stopAgent, type RunningAgent } from "./agent.js";
import { SingleInstanceLockError } from "./agentLifecycle.js";

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

function runMcp(): number {
  // Phase 7 stub — the MCP server is a mode of this same process backed by
  // the same storage/retrieval code (spec FR-23/24, §8.2).
  console.log("recall-agent mcp: not yet implemented (lands in Phase 7).");
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  const command = argv[2];
  if (command === "start") return runStart();
  if (command === "status") return runStatus();
  if (command === "mcp") return runMcp();
  return 1;
}

// Compares resolved paths rather than raw URL strings — `import.meta.url`
// percent-encodes characters like spaces (common in real install paths)
// while `process.argv[1]` does not, so a naive string comparison silently
// fails to match and `main()` never runs.
const isDirectlyExecuted =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectlyExecuted) {
  main(process.argv).then((code) => {
    if (code !== 0) process.exitCode = code;
  });
}
