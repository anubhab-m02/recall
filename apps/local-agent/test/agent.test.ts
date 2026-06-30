import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startAgent, stopAgent, type RunningAgent } from "../src/agent.js";
import { readDiscoveryFile } from "../src/agentLifecycle.js";
import { FakeEmbeddingProvider } from "./helpers/fakeEmbeddingProvider.js";

// A fake provider keeps this suite fast and network-free — real Transformers.js
// integration is covered by the dedicated tests in test/embeddings/ and
// test/retrieval/hybridSearch.real.test.ts instead.
const embeddingProvider = () => new FakeEmbeddingProvider();

// Exercises the real `recall-agent start` boot path end-to-end (spec §13
// Phase 1 DoD) — lock, storage, HTTP server, and discovery file — at the
// function level rather than spawning a child process, so the test stays
// fast and the open server handle is always explicitly closed.
describe("startAgent / stopAgent", () => {
  let dir: string;
  let previousHome: string | undefined;
  let agent: RunningAgent | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "recall-agent-"));
    previousHome = process.env.RECALL_HOME;
    process.env.RECALL_HOME = dir;
  });

  afterEach(async () => {
    if (agent) {
      await stopAgent(agent);
      agent = undefined;
    }
    if (previousHome === undefined) {
      delete process.env.RECALL_HOME;
    } else {
      process.env.RECALL_HOME = previousHome;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("boots a reachable HTTP server and writes the discovery file", async () => {
    agent = await startAgent({ port: 0, embeddingProvider: embeddingProvider() });

    expect(agent.port).toBeGreaterThan(0);

    const discovery = readDiscoveryFile();
    expect(discovery?.port).toBe(agent.port);
    expect(discovery?.token).toBe(agent.token);
    expect(discovery?.pid).toBe(process.pid);

    const res = await fetch(`http://127.0.0.1:${agent.port}/v1/health`);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("ok");
  });

  it("refuses a second instance while the first is running", async () => {
    agent = await startAgent({ port: 0, embeddingProvider: embeddingProvider() });
    await expect(startAgent({ port: 0, embeddingProvider: embeddingProvider() })).rejects.toThrow(
      /already running/
    );
  });

  it("removes the discovery file and lock on stop", async () => {
    agent = await startAgent({ port: 0, embeddingProvider: embeddingProvider() });
    await stopAgent(agent);
    agent = undefined;

    expect(readDiscoveryFile()).toBeUndefined();

    // The lock should be released — a fresh start must succeed immediately.
    const restarted = await startAgent({ port: 0, embeddingProvider: embeddingProvider() });
    agent = restarted;
  });
});
