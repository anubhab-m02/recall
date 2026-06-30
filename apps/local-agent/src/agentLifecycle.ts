// Local Agent lifecycle (spec §6.7): single-instance lock, capability
// token, and the 0600 discovery file (agent.json) trusted clients read to
// find the port + token (spec §8.1, SEC-4a).

import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
  writeSync
} from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDiscoveryPath, getAgentLockPath, getRecallHome } from "./paths.js";

export interface AgentDiscovery {
  port: number;
  pid: number;
  token: string;
  startedAt: string;
  version: string;
}

const TOKEN_BYTES = 32;

export class SingleInstanceLockError extends Error {
  constructor(public readonly existingPid: number) {
    super(`Local Agent is already running (pid ${existingPid})`);
    this.name = "SingleInstanceLockError";
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function writeLockExclusive(lockPath: string): void {
  const fd = openSync(lockPath, "wx", 0o600);
  writeSync(fd, String(process.pid));
  closeSync(fd);
}

// Acquires the exclusive single-instance lock. A second `start` that finds
// a live holder must defer to it rather than spawn a competing agent
// (spec §6.7); a lock left behind by a crashed process (dead pid) is
// reclaimed automatically.
export function acquireLock(): void {
  const lockPath = getAgentLockPath();
  mkdirSync(dirname(lockPath), { recursive: true });
  try {
    writeLockExclusive(lockPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    const existingPid = Number(readFileSync(lockPath, "utf8").trim());
    if (isProcessAlive(existingPid)) {
      throw new SingleInstanceLockError(existingPid);
    }
    rmSync(lockPath, { force: true });
    writeLockExclusive(lockPath);
  }
}

export function releaseLock(): void {
  rmSync(getAgentLockPath(), { force: true });
}

function getTokenPath(): string {
  return join(getRecallHome(), "agent.token");
}

// The capability token is generated once and persisted 0600 so the agent
// and trusted clients keep agreeing on it across restarts (spec §6.7,
// §8.1, SEC-4a). v1 stores it in this 0600 file rather than the OS
// keychain named in spec §9/§10 SEC-2 — that's a documented follow-up
// (keytar adds a native dependency on the headless CLI path), not a
// silent deviation: the file is still keychain-equivalent in permissions
// and is never written to a world-readable location.
export function loadOrCreateToken(): string {
  const tokenPath = getTokenPath();
  if (existsSync(tokenPath)) {
    return readFileSync(tokenPath, "utf8").trim();
  }
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  mkdirSync(dirname(tokenPath), { recursive: true });
  writeFileSync(tokenPath, token, { mode: 0o600 });
  return token;
}

export function writeDiscoveryFile(discovery: AgentDiscovery): void {
  const discoveryPath = getAgentDiscoveryPath();
  mkdirSync(dirname(discoveryPath), { recursive: true });
  writeFileSync(discoveryPath, JSON.stringify(discovery, null, 2), { mode: 0o600 });
}

export function readDiscoveryFile(): AgentDiscovery | undefined {
  const discoveryPath = getAgentDiscoveryPath();
  if (!existsSync(discoveryPath)) return undefined;
  return JSON.parse(readFileSync(discoveryPath, "utf8")) as AgentDiscovery;
}

export function removeDiscoveryFile(): void {
  rmSync(getAgentDiscoveryPath(), { force: true });
}

// Constant-time comparison (SEC-4a) — a naive `===` leaks timing
// information proportional to the matching prefix length.
export function tokensMatch(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}
