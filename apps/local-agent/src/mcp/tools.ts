// The six MCP tools from spec §8.2 (FR-23). Each handler is a thin
// wrapper over an AgentHttpClient call — the MCP server is a mode of the
// same agent process, not a reimplementation (spec FR-24), so no
// search/generation logic is duplicated here. Kept free of the MCP SDK's
// server/transport types so these are unit-testable against a fake
// client; mcp/server.ts is the thin glue that registers them with
// McpServer.

import { z } from "zod";
import type { MemoryEvent } from "@recall/shared-types";
import type { AgentHttpClient } from "./agentHttpClient.js";

export interface MemoryRef {
  id: string;
  type: string;
  occurredAt: string;
  title: string;
  score?: number;
}

function toMemoryRef(event: MemoryEvent): MemoryRef {
  return {
    id: event.id,
    type: event.type,
    occurredAt: event.occurredAt,
    title: event.embeddingText
  };
}

export const searchMemorySchema = {
  query: z.string().describe("Semantic + keyword search query"),
  project: z.string().optional().describe("Restrict results to this project's repoRoot"),
  limit: z.number().int().positive().max(50).optional()
};

export async function searchMemory(
  args: { query: string; project?: string; limit?: number },
  client: AgentHttpClient
): Promise<MemoryRef[]> {
  const { results } = await client.search({
    q: args.query,
    project: args.project,
    limit: args.limit
  });
  return results.map(toMemoryRef);
}

export const getRecentContextSchema = {
  project: z.string().optional(),
  sinceHours: z.number().positive().optional()
};

export async function getRecentContext(
  args: { project?: string; sinceHours?: number },
  client: AgentHttpClient
): Promise<MemoryRef[]> {
  // No query text — /v1/search with only project/limit returns the most
  // recent matching events (spec §8.1: "returns recent events when no
  // query is given"). sinceHours is honored client-side: the HTTP search
  // endpoint has no `since`-by-hours param, only an absolute ISO `since`,
  // and the MCP tool schema here is intentionally the simpler
  // "hours ago" shape a calling agent would naturally reach for.
  const { results } = await client.search({ project: args.project, limit: 20 });
  if (!args.sinceHours) return results.map(toMemoryRef);

  const cutoff = Date.now() - args.sinceHours * 60 * 60 * 1000;
  return results.filter((e) => new Date(e.occurredAt).getTime() >= cutoff).map(toMemoryRef);
}

export const saveMemorySchema = {
  content: z.string().min(1),
  tags: z.array(z.string()).optional()
};

export async function saveMemory(
  args: { content: string; tags?: string[] },
  client: AgentHttpClient
): Promise<{ id: string }> {
  const event = await client.postEvent({
    tenantId: "local",
    deviceId: "mcp",
    source: "manual",
    type: "manual_note",
    occurredAt: new Date().toISOString(),
    payload: { note: args.content },
    embeddingText: `manual_note | ${args.content}`,
    tags: args.tags ?? []
  });
  return { id: event.id };
}

export const getDailyStandupSchema = {
  date: z.string().optional().describe("YYYY-MM-DD; defaults to yesterday")
};

export function getDailyStandup(args: { date?: string }, client: AgentHttpClient) {
  return client.getStandup(args.date);
}

export const getWeeklySummarySchema = {
  week: z.string().optional().describe("YYYY-MM-DD Monday date; defaults to the current week")
};

export function getWeeklySummary(args: { week?: string }, client: AgentHttpClient) {
  return client.getWeeklySummary(args.week);
}

export const getSkillProfileSchema = {};

export function getSkillProfile(_args: Record<string, never>, client: AgentHttpClient) {
  return client.getSkillProfile();
}
