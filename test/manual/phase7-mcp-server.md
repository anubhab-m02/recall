# Manual verification — Phase 7 MCP Server

Phase 7's Definition of Done (spec §13) is specifically that **Claude
Desktop or Claude Code**, configured to use the local MCP server, can
successfully call `search_memory` and `get_daily_standup` and receive
correct, real data from a seeded test database. The MCP protocol wiring
itself (tool registration, real `Client`/`McpServer` round-trips over a
linked transport) is covered by an automated test —
`apps/local-agent/test/mcp/server.test.ts` — but that test fakes the
`AgentHttpClient`, and no automated test can drive an actual external MCP
client process. This script covers what's left.

## Setup

1. `pnpm install && pnpm build` from the repo root.
2. `pnpm --filter @recall/local-agent link --global` (or otherwise put
   `recall-agent` on `PATH`).
3. Start the Local Agent: `recall-agent start`.
4. Seed a few realistic events, e.g.:
   ```
   curl -X POST http://127.0.0.1:<port>/v1/events \
     -H "Authorization: Bearer <token from ~/.recall/agent.json>" \
     -H "Content-Type: application/json" \
     -d '{"tenantId":"local","deviceId":"seed","source":"manual","type":"terminal_command","occurredAt":"2026-07-01T09:00:00.000Z","payload":{"command":"npm test","cwd":"/repo","exitCode":1,"outputExcerpt":""},"embeddingText":"terminal_command | exit=1 | jest timeout exceeded in teardown"}'
   ```

## Checks — sanity without a real MCP client first

5. `recall-agent mcp` should print nothing to stdout and block (it's now
   speaking JSON-RPC over stdio) — `Ctrl+C` to stop. Confirm it does
   *not* immediately exit or print an error, which would mean it couldn't
   find the running agent.
6. Stop the Local Agent (`Ctrl+C` on `recall-agent start`) and re-run
   `recall-agent mcp` alone — confirm it exits promptly with `No running
   Recall Local Agent found...` on stderr (not stdout) and a non-zero
   exit code. Restart the agent afterward for the remaining steps.

## Checks — the actual DoD, with a real MCP client

7. **Claude Desktop**: add the config snippet from
   [apps/local-agent/README.md](../../apps/local-agent/README.md) to
   `claude_desktop_config.json`, restart Claude Desktop, and confirm
   "recall" appears as a connected MCP server (check Settings > Developer
   or the equivalent MCP status UI).
8. Ask Claude Desktop something that requires `search_memory`, e.g. "using
   the recall tool, search my memory for jest timeout." Confirm:
   - it actually invokes `search_memory` (visible in the tool-call UI),
   - the result includes the seeded event from Setup step 4,
   - the data is real (matches what was seeded), not fabricated.
9. Ask it to fetch today's/yesterday's standup via `get_daily_standup`.
   Confirm the tool is invoked and returns the same `draftText` you'd get
   from `curl http://127.0.0.1:<port>/v1/standup`.
10. Repeat steps 7–9 with **Claude Code** instead
    (`claude mcp add recall -- recall-agent mcp`, then ask it to search
    your Recall memory from a `claude` session) to confirm both clients
    documented in the README actually work, not just one.

## Pass criteria

Step 8 and step 9 are the literal DoD assertions: `search_memory` and
`get_daily_standup` both return correct, real data (traceable to the
seeded events) through an actual external MCP client, not just the
in-process SDK test.
