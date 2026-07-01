// MCP server (stdio transport, spec §8.2/FR-23/FR-24): registers the six
// tools from tools.ts against the McpServer SDK, backed by an
// AgentHttpClient pointed at the already-running Local Agent (see
// agentHttpClient.ts's header comment for why this proxies rather than
// opening a second storage connection). This file is thin transport glue
// — the actual tool behavior lives in tools.ts and is unit-tested there.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AGENT_VERSION } from "../server/http.js";
import { createAgentHttpClient, type AgentHttpClient } from "./agentHttpClient.js";
import {
  getDailyStandup,
  getDailyStandupSchema,
  getRecentContext,
  getRecentContextSchema,
  getSkillProfile,
  getSkillProfileSchema,
  getWeeklySummary,
  getWeeklySummarySchema,
  saveMemory,
  saveMemorySchema,
  searchMemory,
  searchMemorySchema
} from "./tools.js";

export function buildMcpServer(client: AgentHttpClient): McpServer {
  const server = new McpServer({ name: "recall", version: AGENT_VERSION });

  server.registerTool(
    "search_memory",
    {
      description:
        "Semantic + keyword search over the user's personal developer memory (past debugging sessions, notes, decisions).",
      inputSchema: searchMemorySchema
    },
    async (args) => ({
      content: [{ type: "text", text: JSON.stringify(await searchMemory(args, client)) }]
    })
  );

  server.registerTool(
    "get_recent_context",
    {
      description: "Returns recent activity for a given project, useful as situational context.",
      inputSchema: getRecentContextSchema
    },
    async (args) => ({
      content: [{ type: "text", text: JSON.stringify(await getRecentContext(args, client)) }]
    })
  );

  server.registerTool(
    "save_memory",
    {
      description: "Explicitly save a note/insight into the user's personal memory.",
      inputSchema: saveMemorySchema
    },
    async (args) => ({
      content: [{ type: "text", text: JSON.stringify(await saveMemory(args, client)) }]
    })
  );

  server.registerTool(
    "get_daily_standup",
    { inputSchema: getDailyStandupSchema },
    async (args) => ({
      content: [{ type: "text", text: JSON.stringify(await getDailyStandup(args, client)) }]
    })
  );

  server.registerTool(
    "get_weekly_summary",
    { inputSchema: getWeeklySummarySchema },
    async (args) => ({
      content: [{ type: "text", text: JSON.stringify(await getWeeklySummary(args, client)) }]
    })
  );

  server.registerTool(
    "get_skill_profile",
    { inputSchema: getSkillProfileSchema },
    async (args) => ({
      content: [{ type: "text", text: JSON.stringify(await getSkillProfile(args, client)) }]
    })
  );

  return server;
}

export async function startMcpServer(): Promise<void> {
  const client = createAgentHttpClient();
  const server = buildMcpServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
