import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHttpServer } from "../../src/server/http.js";
import { SqliteStore } from "../../src/storage/sqlite.js";
import { LanceDbStore } from "../../src/storage/lancedb.js";

const TOKEN = "test-capability-token";

describe("Local Agent HTTP API", () => {
  let dir: string;
  let sqlite: SqliteStore;
  let lancedb: LanceDbStore;
  let app: Express;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "recall-http-"));
    sqlite = new SqliteStore(":memory:");
    lancedb = await LanceDbStore.open(join(dir, "lancedb"));
    app = createHttpServer({ token: TOKEN, sqlite, lancedb });
  });

  afterEach(() => {
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
      const res = await request(app)
        .get("/v1/settings")
        .set("Authorization", "Bearer wrong-token");
      expect(res.status).toBe(401);
    });

    it("accepts a request with the correct token", async () => {
      const res = await request(app)
        .get("/v1/settings")
        .set("Authorization", `Bearer ${TOKEN}`);
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
              payload: { title: "MDN", canonicalUrl: "https://developer.mozilla.org", dwellMs: 1000 },
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
