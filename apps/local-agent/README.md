# @recall/local-agent

The Recall Local Agent: a background daemon holding storage, redaction,
embeddings, retrieval, generation, and scheduling behind a localhost HTTP
API (spec §6, §8.1).

## CLI

```
recall-agent start    # run the daemon (HTTP API on 127.0.0.1:47811 by default)
recall-agent status   # check whether it's running
recall-agent mcp      # run as an MCP server over stdio (see below)
```

## MCP server (spec §8.2, FR-23/FR-24)

`recall-agent mcp` exposes six tools — `search_memory`, `get_recent_context`,
`save_memory`, `get_daily_standup`, `get_weekly_summary`, `get_skill_profile`
— over the Model Context Protocol's stdio transport. It is a *mode of the
same agent process*: it proxies to an already-running `recall-agent start`
daemon over its existing HTTP API (using the capability token from
`~/.recall/agent.json`) rather than opening a second storage connection, so
**the Local Agent must already be running** before an MCP client spawns
`recall-agent mcp`.

### Claude Desktop

Add to Claude Desktop's `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "recall": {
      "command": "recall-agent",
      "args": ["mcp"]
    }
  }
}
```

### Claude Code

```
claude mcp add recall -- recall-agent mcp
```

Either way, make sure `recall-agent start` is running first (or let the
VS Code extension spawn it automatically on activation).
