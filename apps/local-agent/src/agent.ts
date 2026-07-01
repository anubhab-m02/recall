// Boot/shutdown orchestration for the Local Agent daemon (spec §6.7,
// §13 Phase 1 DoD: "Local Agent runs as `recall-agent start`"). Wires the
// storage layers, capability token, embedding provider/queue, and HTTP
// server together, with the single-instance lock and discovery file
// required by spec §6.7.

import type { Server } from "node:http";
import type express from "express";
import {
  acquireLock,
  loadOrCreateToken,
  releaseLock,
  removeDiscoveryFile,
  writeDiscoveryFile
} from "./agentLifecycle.js";
import type { EmbeddingProvider } from "./embeddings/provider.js";
import { EmbeddingQueue } from "./embeddings/queue.js";
import { TransformersJsEmbeddingProvider } from "./embeddings/transformersJsProvider.js";
import { ExtractiveFallbackProvider } from "./generation/extractiveFallbackProvider.js";
import { OllamaProvider } from "./generation/ollamaProvider.js";
import { resolveGenerationProvider, type GenerationProvider } from "./generation/provider.js";
import { startScheduler, type Scheduler } from "./jobs/scheduler.js";
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
  embeddingQueue: EmbeddingQueue;
  scheduler: Scheduler;
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

export interface StartAgentOptions {
  port?: number;
  // Overridable for tests (and any future non-Transformers.js provider) —
  // defaults to the real local model so production boots need no wiring.
  embeddingProvider?: EmbeddingProvider;
  // Overridable for tests — defaults to auto-detected Ollama, falling
  // back to the always-available extractive provider (spec §6.1).
  generationProvider?: GenerationProvider;
}

export async function startAgent(options: StartAgentOptions = {}): Promise<RunningAgent> {
  acquireLock();
  try {
    const token = loadOrCreateToken();
    const sqlite = new SqliteStore(getSqlitePath());
    const lancedb = await LanceDbStore.open(getLanceDbPath());
    const embeddingProvider = options.embeddingProvider ?? new TransformersJsEmbeddingProvider();
    const embeddingQueue = new EmbeddingQueue(embeddingProvider, lancedb);
    const generationProvider =
      options.generationProvider ??
      (await resolveGenerationProvider([new OllamaProvider(), new ExtractiveFallbackProvider()]));

    // Recover from a restart that interrupted background embedding: any
    // event still missing its embedding gets re-enqueued.
    const unembedded = await lancedb.scanEventsForSearch({ tenantId: "local" });
    for (const event of unembedded) {
      if (!event.embeddingModel) embeddingQueue.enqueue(event.id);
    }

    const app = createHttpServer({
      token,
      sqlite,
      lancedb,
      embeddings: embeddingProvider,
      embeddingQueue,
      generation: generationProvider
    });
    const { server, port } = await listen(app, options.port ?? DEFAULT_PORT);

    writeDiscoveryFile({
      port,
      pid: process.pid,
      token,
      startedAt: new Date().toISOString(),
      version: AGENT_VERSION
    });

    const scheduler = startScheduler({
      tenantId: "local",
      lancedb,
      sqlite,
      provider: generationProvider,
      embeddings: embeddingProvider
    });

    return { app, server, sqlite, lancedb, embeddingQueue, scheduler, token, port };
  } catch (err) {
    releaseLock();
    throw err;
  }
}

export async function stopAgent(agent: RunningAgent): Promise<void> {
  agent.scheduler.stop();
  await new Promise<void>((resolve, reject) => {
    agent.server.close((err) => (err ? reject(err) : resolve()));
  });
  // Must happen before closing lancedb — otherwise an in-flight embed()
  // write can race a closed connection (see EmbeddingQueue.stop).
  await agent.embeddingQueue.stop();
  agent.sqlite.close();
  agent.lancedb.close();
  removeDiscoveryFile();
  releaseLock();
}
