// Resolves the per-user app-data directory (spec §7.5: "Both live under a
// single per-user app-data directory, e.g. ~/.recall/"). Overridable via
// RECALL_HOME so tests and multiple local installs never collide with a
// real user's data.

import { homedir } from "node:os";
import { join } from "node:path";

export function getRecallHome(): string {
  return process.env.RECALL_HOME ?? join(homedir(), ".recall");
}

export function getSqlitePath(): string {
  return join(getRecallHome(), "recall.sqlite3");
}

export function getLanceDbPath(): string {
  return join(getRecallHome(), "lancedb");
}

// Single-instance lock + capability-token discovery file (spec §6.7).
export function getAgentLockPath(): string {
  return join(getRecallHome(), "agent.lock");
}

export function getAgentDiscoveryPath(): string {
  return join(getRecallHome(), "agent.json");
}
