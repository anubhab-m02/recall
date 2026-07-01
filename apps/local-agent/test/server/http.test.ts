import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EmbeddingQueue } from "../../src/embeddings/queue.js";
import { createHttpServer } from "../../src/server/http.js";
import { SqliteStore } from "../../src/storage/sqlite.js";
import { LanceDbStore } from "../../src/storage/lancedb.js";
import { FakeEmbeddingProvider } from "../helpers/fakeEmbeddingProvider.js";
import { FakeGenerationProvider } from "../helpers/fakeGenerationProvider.js";

const TOKEN = "test-capability-token";

describe("Local Agent HTTP API", () => {
  let dir: string;
  let sqlite: SqliteStore;
  let lancedb: LanceDbStore;
  let embeddingQueue: EmbeddingQueue;
  let app: Express;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "recall-http-"));
    sqlite = new SqliteStore(":memory:");
    lancedb = await LanceDbStore.open(join(dir, "lancedb"));
    const embeddings = new FakeEmbeddingProvider();
    const generation = new FakeGenerationProvider();
    embeddingQueue = new EmbeddingQueue(embeddings, lancedb);
    app = createHttpServer({
      token: TOKEN,
      sqlite,
      lancedb,
      embeddings,
      embeddingQueue,
      generation
    });
  });

  afterEach(async () => {
    // Must stop the queue before closing lancedb — an in-flight embed()
    // write would otherwise race a closed connection.
    await embeddingQueue.stop();
    sqlite.close();
    lancedb.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe("GET /v1/health", () => {
    it("responds without a capability token", async () => {
      const res = await request(app).get("/v1/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });
  });

  describe("authentication (SEC-4a)", () => {
    it("rejects a request with no token", async () => {
      const res = await request(app).get("/v1/settings");
      expect(res.status).toBe(401);
    });

    it("rejects a request with the wrong token", async () => {
      const res = await request(app).get("/v1/settings").set("Authorization", "Bearer wrong-token");
      expect(res.status).toBe(401);
    });

    it("accepts a request with the correct token", async () => {
      const res = await request(app).get("/v1/settings").set("Authorization", `Bearer ${TOKEN}`);
      expect(res.status).toBe(200);
    });
  });

  describe("POST /v1/events — end-to-end through redaction into storage", () => {
    it("ingests an event, redacts secrets, and persists it to LanceDB", async () => {
      const res = await request(app)
        .post("/v1/events")
        .set("Authorization", `Bearer ${TOKEN}`)
        .send({
          tenantId: "local",
          deviceId: "device-1",
          source: "vscode",
          type: "terminal_command",
          occurredAt: "2026-07-01T00:00:00.000Z",
          payload: {
            command: "export AWS_KEY=AKIAIOSFODNN7EXAMPLE",
            cwd: "/repo",
            exitCode: 0,
            outputExcerpt: "done"
          },
          embeddingText: "terminal_command | exit=0 | export AWS_KEY=AKIAIOSFODNN7EXAMPLE"
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body.redacted).toBe(true);
      expect(JSON.stringify(res.body.payload)).not.toContain("AKIAIOSFODNN7EXAMPLE");

      // The secret must never have reached storage, even transiently (SEC-3).
      const stored = await lancedb.getEventById(res.body.id);
      expect(stored).toBeDefined();
      expect(JSON.stringify(stored)).not.toContain("AKIAIOSFODNN7EXAMPLE");

      // And the ingestion must be reflected in the audit log (SEC-8).
      const audit = sqlite.getAuditLog();
      expect(audit.some((entry) => entry.action === "event.ingested")).toBe(true);
    });

    it("rejects a malformed event", async () => {
      const res = await request(app)
        .post("/v1/events")
        .set("Authorization", `Bearer ${TOKEN}`)
        .send({ type: "not-a-real-type" });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /v1/events/batch", () => {
    it("ingests multiple events in one call", async () => {
      const res = await request(app)
        .post("/v1/events/batch")
        .set("Authorization", `Bearer ${TOKEN}`)
        .send({
          events: [
            {
              tenantId: "local",
              deviceId: "device-1",
              source: "browser",
              type: "page_visit",
              occurredAt: "2026-07-01T00:00:00.000Z",
              payload: {
                title: "MDN",
                canonicalUrl: "https://developer.mozilla.org",
                dwellMs: 1000
              },
              embeddingText: "page_visit | MDN"
            },
            {
              tenantId: "local",
              deviceId: "device-1",
              source: "browser",
              type: "search_query",
              occurredAt: "2026-07-01T00:01:00.000Z",
              payload: { engineOrSite: "google.com", query: "jest timeout" },
              embeddingText: "search_query | jest timeout"
            }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.events).toHaveLength(2);
      expect(await lancedb.countEvents()).toBe(2);
    });
  });

  describe("POST /v1/redaction/test", () => {
    it("reports findings without persisting anything", async () => {
      const res = await request(app)
        .post("/v1/redaction/test")
        .set("Authorization", `Bearer ${TOKEN}`)
        .send({ text: "DATABASE_SECRET=abcdef123456zyxwvu" });

      expect(res.status).toBe(200);
      expect(res.body.redacted).toContain("[REDACTED:");
      expect(res.body.findings.length).toBeGreaterThan(0);
      expect(await lancedb.countEvents()).toBe(0);
    });
  });

  describe("GET /v1/search", () => {
    async function ingest(overrides: Record<string, unknown>) {
      return request(app)
        .post("/v1/events")
        .set("Authorization", `Bearer ${TOKEN}`)
        .send({
          tenantId: "local",
          deviceId: "device-1",
          source: "vscode",
          type: "terminal_command",
          occurredAt: "2026-07-01T00:00:00.000Z",
          payload: { command: "npm test", cwd: "/repo", exitCode: 0, outputExcerpt: "ok" },
          embeddingText: "terminal_command | exit=0 | npm test",
          ...overrides
        });
    }

    it("ranks keyword matches above unrelated events, most recent match first", async () => {
      await ingest({
        occurredAt: "2026-07-01T00:00:00.000Z",
        embeddingText: "terminal_command | exit=1 | jest timeout exceeded"
      });
      await ingest({
        occurredAt: "2026-07-02T00:00:00.000Z",
        embeddingText: "terminal_command | exit=1 | jest timeout exceeded again"
      });
      await ingest({
        occurredAt: "2026-07-01T12:00:00.000Z",
        embeddingText: "terminal_command | exit=0 | npm build"
      });

      const res = await request(app)
        .get("/v1/search")
        .query({ q: "jest timeout" })
        .set("Authorization", `Bearer ${TOKEN}`);

      expect(res.status).toBe(200);
      // Hybrid search ranks rather than hard-filters (spec §11.2), so all
      // three candidates come back, but the two keyword matches must rank
      // above the unrelated one, and the more recent match first.
      expect(res.body.results).toHaveLength(3);
      expect(res.body.results[0].embeddingText).toContain("again");
      expect(res.body.results[1].embeddingText).toContain("jest timeout exceeded");
      expect(res.body.results[2].embeddingText).toContain("npm build");
    });

    it("filters by type", async () => {
      await ingest({ type: "terminal_command" });
      await ingest({
        type: "git_commit",
        payload: { sha: "abc123", message: "fix bug", filesChanged: [], diffStat: "" },
        embeddingText: "git_commit | fix bug"
      });

      const res = await request(app)
        .get("/v1/search")
        .query({ type: "git_commit" })
        .set("Authorization", `Bearer ${TOKEN}`);

      expect(res.body.results).toHaveLength(1);
      expect(res.body.results[0].type).toBe("git_commit");
    });

    it("returns recent events when no query is given", async () => {
      await ingest({});
      const res = await request(app).get("/v1/search").set("Authorization", `Bearer ${TOKEN}`);
      expect(res.body.results).toHaveLength(1);
    });

    it("requires authentication", async () => {
      const res = await request(app).get("/v1/search");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /v1/context/related", () => {
    it("surfaces related events for a file/errorText query without an explicit search", async () => {
      await request(app)
        .post("/v1/events")
        .set("Authorization", `Bearer ${TOKEN}`)
        .send({
          tenantId: "local",
          deviceId: "device-1",
          source: "vscode",
          type: "terminal_command",
          occurredAt: "2026-07-01T00:00:00.000Z",
          payload: { command: "npm test", cwd: "/repo", exitCode: 1, outputExcerpt: "" },
          embeddingText: "terminal_command | exit=1 | jest timeout exceeded in teardown"
        });

      const res = await request(app)
        .get("/v1/context/related")
        .query({ errorText: "jest timeout exceeded" })
        .set("Authorization", `Bearer ${TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(1);
      expect(res.body.results[0].embeddingText).toContain("jest timeout");
    });

    it("returns no results when neither file nor errorText is given", async () => {
      const res = await request(app)
        .get("/v1/context/related")
        .set("Authorization", `Bearer ${TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.results).toEqual([]);
    });

    it("requires authentication", async () => {
      const res = await request(app).get("/v1/context/related").query({ file: "a.ts" });
      expect(res.status).toBe(401);
    });
  });

  describe("POST /v1/ask (spec §11.4, FR-19)", () => {
    it("answers with citations for retrieved memories", async () => {
      await request(app)
        .post("/v1/events")
        .set("Authorization", `Bearer ${TOKEN}`)
        .send({
          tenantId: "local",
          deviceId: "device-1",
          source: "vscode",
          type: "terminal_command",
          occurredAt: "2026-07-01T00:00:00.000Z",
          payload: { command: "npm run migrate", cwd: "/repo", exitCode: 0, outputExcerpt: "" },
          embeddingText: "terminal_command | staging db pool set to 20 connections"
        });

      const res = await request(app)
        .post("/v1/ask")
        .set("Authorization", `Bearer ${TOKEN}`)
        .send({ question: "staging db pool" });

      expect(res.status).toBe(200);
      expect(res.body.answer).toEqual(expect.any(String));
      expect(res.body.citations).toHaveLength(1);
    });

    it("requires a non-empty question", async () => {
      const res = await request(app)
        .post("/v1/ask")
        .set("Authorization", `Bearer ${TOKEN}`)
        .send({ question: "" });
      expect(res.status).toBe(400);
    });

    it("requires authentication", async () => {
      const res = await request(app).post("/v1/ask").send({ question: "x" });
      expect(res.status).toBe(401);
    });
  });

  describe("GET /v1/standup (spec §7.3, FR-20)", () => {
    it("generates a standup for an explicit date", async () => {
      const res = await request(app)
        .get("/v1/standup")
        .query({ date: "2026-07-01" })
        .set("Authorization", `Bearer ${TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.date).toBe("2026-07-01");
      expect(res.body.draftText).toEqual(expect.any(String));
    });

    it("returns the same standup on a second request rather than regenerating", async () => {
      const first = await request(app)
        .get("/v1/standup")
        .query({ date: "2026-07-01" })
        .set("Authorization", `Bearer ${TOKEN}`);
      const second = await request(app)
        .get("/v1/standup")
        .query({ date: "2026-07-01" })
        .set("Authorization", `Bearer ${TOKEN}`);

      expect(second.body.generatedAt).toBe(first.body.generatedAt);
    });

    it("requires authentication", async () => {
      const res = await request(app).get("/v1/standup");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /v1/standup/weekly (spec §7.3, FR-21)", () => {
    it("generates a weekly summary for an explicit week", async () => {
      const res = await request(app)
        .get("/v1/standup/weekly")
        .query({ week: "2026-06-29" })
        .set("Authorization", `Bearer ${TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.weekOf).toBe("2026-06-29");
      expect(res.body.draftText).toEqual(expect.any(String));
    });

    it("requires authentication", async () => {
      const res = await request(app).get("/v1/standup/weekly");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /v1/skill-profile (spec §7.4, FR-22)", () => {
    it("returns a well-formed empty profile before aggregation has run (Phase 10)", async () => {
      const res = await request(app)
        .get("/v1/skill-profile")
        .set("Authorization", `Bearer ${TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.tenantId).toBe("local");
      expect(res.body.tagFrequencies).toEqual({});
    });

    it("requires authentication", async () => {
      const res = await request(app).get("/v1/skill-profile");
      expect(res.status).toBe(401);
    });
  });

  describe("capture pause/resume (FR-25)", () => {
    it("pauses and resumes capture", async () => {
      const pauseRes = await request(app)
        .post("/v1/capture/pause")
        .set("Authorization", `Bearer ${TOKEN}`);
      expect(pauseRes.body.capturePaused).toBe(true);

      const resumeRes = await request(app)
        .post("/v1/capture/resume")
        .set("Authorization", `Bearer ${TOKEN}`);
      expect(resumeRes.body.capturePaused).toBe(false);
    });
  });

  describe("GET/POST /v1/settings", () => {
    it("merges a partial update into existing settings", async () => {
      await request(app)
        .post("/v1/settings")
        .set("Authorization", `Bearer ${TOKEN}`)
        .send({ domainAllowlist: ["stackoverflow.com"] });

      const res = await request(app).get("/v1/settings").set("Authorization", `Bearer ${TOKEN}`);
      expect(res.body.domainAllowlist).toEqual(["stackoverflow.com"]);
      expect(res.body.syncOptIns.encryptedBackup).toBe(false);
    });
  });
});
