// Boot/shutdown orchestration for the Local Agent daemon (spec §6.7,
// §13 Phase 1 DoD: "Local Agent runs as `recall-agent start`"). Wires the
// storage layers, capability token, and HTTP server together, with the
// single-instance lock and discovery file required by spec §6.7.

import type { Server } from "node:http";
import type express from "express";
import {
  acquireLock,
  loadOrCreateToken,
  releaseLock,
  removeDiscoveryFile,
  writeDiscoveryFile
} from "./agentLifecycle.js";
import { getLanceDbPath, getSqlitePath } from "./paths.js";
import { AGENT_VERSION, createHttpServer } from "./server/http.js";
import { LanceDbStore } from "./storage/lancedb.js";
import { SqliteStore } from "./storage/sqlite.js";

export const DEFAULT_PORT = 47811;
const MAX_PORT_ATTEMPTS = 20;

export interface RunningAgent {
  app: express.Express;
  server: Server;
  sqlite: SqliteStore;
  lancedb: LanceDbStore;
  token: string;
  port: number;
}

function listen(
  app: express.Express,
  startPort: number
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const tryPort = (port: number, attemptsLeft: number): void => {
      const server = app.listen(port, "127.0.0.1");
      server.once("listening", () => {
        // port 0 means "let the OS pick an ephemeral port" — the actual
        // bound port only exists on server.address() once listening.
        const address = server.address();
        const boundPort = typeof address === "object" && address !== null ? address.port : port;
        resolve({ server, port: boundPort });
      });
      server.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && attemptsLeft > 0 && port !== 0) {
          tryPort(port + 1, attemptsLeft - 1);
        } else {
          reject(err);
        }
      });
    };
    tryPort(startPort, MAX_PORT_ATTEMPTS);
  });
}

export async function startAgent(options: { port?: number } = {}): Promise<RunningAgent> {
  acquireLock();
  try {
    const token = loadOrCreateToken();
    const sqlite = new SqliteStore(getSqlitePath());
    const lancedb = await LanceDbStore.open(getLanceDbPath());
    const app = createHttpServer({ token, sqlite, lancedb });
    const { server, port } = await listen(app, options.port ?? DEFAULT_PORT);

    writeDiscoveryFile({
      port,
      pid: process.pid,
      token,
      startedAt: new Date().toISOString(),
      version: AGENT_VERSION
    });

    return { app, server, sqlite, lancedb, token, port };
  } catch (err) {
    releaseLock();
    throw err;
  }
}

export async function stopAgent(agent: RunningAgent): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    agent.server.close((err) => (err ? reject(err) : resolve()));
  });
  agent.sqlite.close();
  agent.lancedb.close();
  removeDiscoveryFile();
  releaseLock();
}
