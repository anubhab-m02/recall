// Local Agent HTTP API (spec §8.1). Every request except /v1/health must
// be loopback-bound (SEC-4) and carry the capability token (SEC-4a) —
// loopback alone does not stop another local process, or a webpage's
// fetch() to 127.0.0.1, from reaching this server (spec §6.6 threat model).

import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { MemoryEventInputSchema, SettingsSchema, type Settings } from "@recall/shared-types";
import { tokensMatch } from "../agentLifecycle.js";
import { getWebDashboardDistPath } from "./dashboardStatic.js";
import type { EmbeddingProvider } from "../embeddings/provider.js";
import type { EmbeddingQueue } from "../embeddings/queue.js";
import type { GenerationProvider } from "../generation/provider.js";
import { generateDailyStandup } from "../jobs/dailyStandup.js";
import { generateSkillProfile } from "../jobs/skillProfile.js";
import { generateWeeklySummary } from "../jobs/weeklySummary.js";
import { testRedaction } from "../redaction/pipeline.js";
import { hybridSearch } from "../retrieval/hybridSearch.js";
import { ragAsk } from "../retrieval/ragAsk.js";
import { getRelatedContext } from "../retrieval/relatedContext.js";
import { ingestEvent } from "../ingestEvent.js";
import type { SqliteStore } from "../storage/sqlite.js";
import type { LanceDbStore } from "../storage/lancedb.js";

export const AGENT_VERSION = "0.1.0";

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export interface HttpServerDeps {
  token: string;
  sqlite: SqliteStore;
  lancedb: LanceDbStore;
  embeddings: EmbeddingProvider;
  embeddingQueue: EmbeddingQueue;
  generation: GenerationProvider;
}

function isLoopback(remoteAddress: string | undefined): boolean {
  return remoteAddress !== undefined && LOOPBACK_ADDRESSES.has(remoteAddress);
}

function sendValidationError(res: Response, error: z.ZodError): void {
  res.status(400).json({ error: "invalid_request", issues: error.issues });
}

export function createHttpServer(deps: HttpServerDeps): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "5mb" }));

  // SEC-4: reject any request whose remote address is not loopback.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!isLoopback(req.socket.remoteAddress)) {
      res.status(403).json({ error: "loopback_required" });
      return;
    }
    next();
  });

  // SEC-4a: every route except /v1/health requires the capability token.
  // Accepted either as `Authorization: Bearer <token>` (every programmatic
  // client — VS Code/browser extensions, MCP proxy) or as a `?token=`
  // query param, so the dashboard (a plain page navigated to directly in a
  // browser, spec §13 Phase 10) can be reached with a self-contained URL
  // rather than requiring a separate pairing step — the same pattern
  // Jupyter uses for its local, token-protected web UI. The token itself
  // is still required and compared in constant time either way; this
  // widens *how* it may be presented, not whether it's needed.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === "/v1/health") {
      next();
      return;
    }
    const header = req.header("authorization") ?? "";
    const headerToken = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    const queryToken = typeof req.query.token === "string" ? req.query.token : "";
    const provided = headerToken || queryToken;
    if (!provided || !tokensMatch(provided, deps.token)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  });

  app.get("/v1/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok", version: AGENT_VERSION });
  });

  app.post("/v1/events", async (req: Request, res: Response) => {
    const parsed = MemoryEventInputSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }
    const event = await ingestEvent(parsed.data, deps);
    res.status(201).json(event);
  });

  app.post("/v1/events/batch", async (req: Request, res: Response) => {
    const parsed = z.object({ events: z.array(MemoryEventInputSchema) }).safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }
    const events = [];
    for (const input of parsed.data.events) {
      events.push(await ingestEvent(input, deps));
    }
    res.status(201).json({ events });
  });

  app.get("/v1/search", async (req: Request, res: Response) => {
    const parsed = z
      .object({
        q: z.string().optional(),
        type: z.string().optional(),
        project: z.string().optional(),
        since: z.string().optional(),
        limit: z.coerce.number().int().positive().max(200).optional(),
        tenantId: z.string().optional()
      })
      .safeParse(req.query);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }
    const { q, type, project, since, limit, tenantId } = parsed.data;
    const results = await hybridSearch(
      { tenantId: tenantId ?? "local", query: q, type, project, since, limit },
      deps
    );
    res.status(200).json({ results });
  });

  app.get("/v1/context/related", async (req: Request, res: Response) => {
    const parsed = z
      .object({
        file: z.string().optional(),
        errorText: z.string().optional(),
        tenantId: z.string().optional(),
        limit: z.coerce.number().int().positive().max(20).optional()
      })
      .safeParse(req.query);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }
    const { file, errorText, tenantId, limit } = parsed.data;
    const results = await getRelatedContext(
      { tenantId: tenantId ?? "local", file, errorText, limit },
      deps
    );
    res.status(200).json({ results });
  });

  app.post("/v1/ask", async (req: Request, res: Response) => {
    const parsed = z
      .object({ question: z.string().min(1), tenantId: z.string().optional() })
      .safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }
    const { question, tenantId } = parsed.data;
    const result = await ragAsk(tenantId ?? "local", question, {
      lancedb: deps.lancedb,
      embeddings: deps.embeddings,
      provider: deps.generation
    });
    res.status(200).json(result);
  });

  app.get("/v1/standup", async (req: Request, res: Response) => {
    const parsed = z
      .object({ date: z.string().optional(), tenantId: z.string().optional() })
      .safeParse(req.query);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }
    const { date, tenantId } = parsed.data;
    const jobDeps = { lancedb: deps.lancedb, sqlite: deps.sqlite, provider: deps.generation };
    const standup = date
      ? (deps.sqlite.getDailyStandupByDate(date) ??
        (await generateDailyStandup(tenantId ?? "local", jobDeps, date)))
      : await generateDailyStandup(tenantId ?? "local", jobDeps);
    res.status(200).json(standup);
  });

  app.get("/v1/standup/weekly", async (req: Request, res: Response) => {
    const parsed = z
      .object({ week: z.string().optional(), tenantId: z.string().optional() })
      .safeParse(req.query);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }
    const { week, tenantId } = parsed.data;
    const jobDeps = { lancedb: deps.lancedb, sqlite: deps.sqlite, provider: deps.generation };
    const summary = week
      ? (deps.sqlite.getWeeklySummaryByWeekOf(week) ??
        (await generateWeeklySummary(tenantId ?? "local", jobDeps, week)))
      : await generateWeeklySummary(tenantId ?? "local", jobDeps);
    res.status(200).json(summary);
  });

  app.get("/v1/skill-profile", async (req: Request, res: Response) => {
    const parsed = z.object({ tenantId: z.string().optional() }).safeParse(req.query);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }
    // Recomputed fresh on every request (spec FR-22) — cheap over the
    // corpus sizes a v1 local install accumulates, same rationale as
    // hybridSearch's full scan. Also persisted so it's available to the
    // MCP get_skill_profile tool between dashboard/API calls.
    const profile = await generateSkillProfile(parsed.data.tenantId ?? "local", {
      lancedb: deps.lancedb,
      sqlite: deps.sqlite
    });
    res.status(200).json(profile);
  });

  // Static dashboard (spec §13 Phase 10) — gated by the same SEC-4a
  // middleware above (query-param token accepted), served from the
  // pre-built @recall/web-dashboard package.
  app.use("/dashboard", express.static(getWebDashboardDistPath()));

  app.post("/v1/redaction/test", (req: Request, res: Response) => {
    const parsed = z.object({ text: z.string() }).safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }
    res.status(200).json(testRedaction(parsed.data.text));
  });

  app.get("/v1/settings", (_req: Request, res: Response) => {
    res.status(200).json(deps.sqlite.getSettings());
  });

  app.post("/v1/settings", (req: Request, res: Response) => {
    const parsed = SettingsSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }
    const merged: Settings = { ...deps.sqlite.getSettings(), ...parsed.data };
    deps.sqlite.setSettings(merged);
    deps.sqlite.appendAuditLog("settings.updated", parsed.data);
    res.status(200).json(merged);
  });

  app.post("/v1/capture/pause", (_req: Request, res: Response) => {
    const settings = { ...deps.sqlite.getSettings(), capturePaused: true };
    deps.sqlite.setSettings(settings);
    deps.sqlite.appendAuditLog("capture.paused");
    res.status(200).json(settings);
  });

  app.post("/v1/capture/resume", (_req: Request, res: Response) => {
    const settings = { ...deps.sqlite.getSettings(), capturePaused: false };
    deps.sqlite.setSettings(settings);
    deps.sqlite.appendAuditLog("capture.resumed");
    res.status(200).json(settings);
  });

  // Express 5 forwards rejected async handlers here automatically.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: "internal_error", message: (err as Error).message });
  });

  return app;
}
