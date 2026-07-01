# Manual verification — Phase 6 Generation (standup, weekly summary, lessons)

Phase 6's Definition of Done (spec §13) is specifically about *draft
quality* with and without a real LLM — something no automated assertion
can judge ("does this read as natural prose," "is there hallucinated
work"). The mechanics (extractive fallback always producing something,
correct event attribution, endpoint wiring) are covered by automated tests
in `apps/local-agent/test/jobs/`, `test/generation/`, and
`test/retrieval/ragAsk.test.ts`; this script covers the DoD's actual
judgment call.

## Setup

1. `pnpm install && pnpm build` from the repo root.
2. Start the Local Agent: `pnpm --filter @recall/local-agent exec recall-agent start`.
3. Seed a day's worth of realistic activity — either use VS Code capture
   for real (edit files, run terminal commands, hit a debug session) for
   at least 30–60 minutes, or seed directly via `curl -X POST
   http://127.0.0.1:<port>/v1/events` (with the capability token from
   `~/.recall/agent.json`) using a handful of varied event types
   (`terminal_command`, `file_edit`, `git_commit`) with `occurredAt`
   timestamps from yesterday.

## Part A — extractive fallback (no Ollama installed)

1. Confirm Ollama is **not** running (`curl http://127.0.0.1:11434/api/tags`
   should fail to connect).
2. `curl http://127.0.0.1:<port>/v1/standup -H "Authorization: Bearer <token>"`.
3. **Pass criteria**: `draftText` is non-empty and readable — a bullet
   list of the day's events (spec: "a templated bullet list of event
   titles"), not an error, not a placeholder like "undefined". Every
   bullet should trace back to something you actually did.
4. Repeat for `/v1/standup/weekly?week=<Monday date>` and `/v1/ask` (`curl
   -X POST .../v1/ask -d '{"question": "what did I work on?"}'`) — same
   pass criteria: readable, non-empty, no crash.

## Part B — real Ollama-backed generation

5. Install Ollama (https://ollama.com) and pull a small model:
   `ollama pull llama3.2:3b`. Confirm `curl
   http://127.0.0.1:11434/api/tags` now succeeds.
6. Restart the Local Agent (`resolveGenerationProvider` runs once at
   startup) so it picks up Ollama.
7. Re-run the same `/v1/standup`, `/v1/standup/weekly`, and `/v1/ask`
   requests from Part A.
8. **Pass criteria (the actual DoD language)**:
   - The standup draft reads as **natural prose**, not a bullet dump —
     e.g. "Yesterday you fixed a flaky Jest test and started the OAuth
     refactor" rather than a templated list.
   - Every claim in the draft is **attributable to a real captured
     event** — cross-check against the seeded events from Setup step 3.
     There should be **no hallucinated work**: no mention of files,
     commands, or fixes that were never actually captured.
   - `/v1/ask`'s answer cites memory ids that correspond to real events,
     and doesn't fabricate an answer when the seeded data doesn't
     actually cover the question (it should say so, per FR-19).

## Part C — VS Code panels

9. In the Extension Development Host (or a packaged install), run
   `Recall: Show Daily Standup`, `Recall: Show Weekly Summary`, and
   `Recall: Ask My Memory`. Confirm each opens a side panel with the draft
   text and a working **Copy** button (paste somewhere after clicking to
   confirm the clipboard actually received the text).

## Pass criteria summary

Extractive fallback must never leave a feature silently broken (Part A).
With a real local model configured, the DoD requires genuinely
better-quality, hallucination-free prose (Part B) — this is a judgment
call a human needs to make by reading the output against what was
actually captured.
