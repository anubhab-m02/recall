# Recall

Personal, local-first developer memory. Recall quietly captures your file
saves, terminal commands, git activity, and debug sessions, then turns it
into something you can search, ask questions of, and get standups/summaries
from — entirely on your machine. No cloud account, no sign-up, and no
recurring cost in v1.

See [docs/recall-prd-and-architecture.md](docs/recall-prd-and-architecture.md)
for the full product spec and architecture; it's the source of truth this
repo is built against, phase by phase (§13). The v2 cloud/sync design that's
deliberately deferred out of v1 lives in
[docs/recall-v2-cloud-and-distribution.md](docs/recall-v2-cloud-and-distribution.md).

## Architecture

One background daemon, the **Local Agent**, owns all real logic — storage,
redaction, embeddings, retrieval, generation, scheduling. Every other surface
is a thin client that talks to it over a token-authenticated localhost
HTTP/WS API:

- **VS Code extension** (`apps/vscode-extension`) — silent capture (file
  diffs, terminal commands, git, debug sessions, diagnostics), a sidebar of
  recent memories, Ask Recall / Daily Standup / Weekly Summary, and an
  in-editor walkthrough.
- **Browser extension** (`apps/browser-extension`) — MV3 capture with a
  durable IndexedDB queue, pause/resume and per-domain opt-out.
- **Local Agent** (`apps/local-agent`) — SQLite (settings, audit log,
  tombstones) + LanceDB (memories + embeddings) behind the HTTP API; also
  runs as an MCP server (`recall-agent mcp`) so Claude Desktop/Code can query
  the same memory as a tool.
- **Web dashboard** (`apps/web-dashboard`) — a small local-only page, served
  by the Local Agent, visualizing skill/tag trends over time.
- **Backend** (`apps/backend`) — v2 cloud sync stub only; not built or run in
  v1 (zero-cost by design).

Shared code lives in `packages/{shared-types,redaction-rules,prompt-templates,ui-kit}`.

## Getting started (development)

```bash
pnpm install
pnpm build
pnpm test
```

- `pnpm --filter <package> test -- <file-or-name>` — run a single package's
  tests (Vitest everywhere).
- `recall-agent start` — run the Local Agent directly (after building
  `apps/local-agent`); `recall-agent status` / `recall-agent mcp` are also
  available.
- `pnpm --filter recall-vscode-extension package` — build a `.vsix` you can
  install with `code --install-extension`.

Manual verification scripts for each phase's Definition of Done live under
[test/manual/](test/manual/).

## Privacy

Redaction runs before anything is persisted or embedded — API keys, JWTs,
`.env`-style values, and credentials in URLs are stripped before they ever
reach disk. See the spec's §5.2/§10 for the full threat model.
