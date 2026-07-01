# Recall

Personal, local-first developer memory. Recall quietly captures your debugging
process — file saves, terminal commands, git activity, resolved errors, debug
sessions — and turns it into something you can search, ask questions of, and
get summaries from. Everything runs on your machine.

## What it does for you

- **Ask Recall** — ask a question about your own past work in plain English
  ("how did I configure the staging DB connection pool last time?") and get an
  answer sourced from what you actually did, with citations.
- **Daily Standup / Weekly Summary** — a draft "yesterday / today / blockers"
  update generated from your real activity, not from memory.
- **In-context resurfacing** — when you hit a similar error or open a related
  file, Recall surfaces past memories that might help, right in the sidebar.
- **Search My Memory** — full-text and semantic search over everything Recall
  has captured.

All three of the above are one click away from the Recall sidebar's `...`
menu — no need to remember command names or use the Command Palette.

## What's captured

- File saves, as a **diff** against the previous version — never the full
  file content.
- Terminal commands: the command line, working directory, exit code, and a
  truncated output excerpt.
- Git commits and branch switches.
- Debug sessions: launch config name and any exceptions hit.
- Resolved errors/warnings, the moment a diagnostic clears.
- Task runs (build/test/watch) and their exit codes.
- Manual notes you save explicitly with **Recall: Save as Memory**.

## Privacy

Nothing leaves your machine. Recall runs a small local background process
(the Local Agent) that stores everything under `~/.recall/`. Before anything
is saved or embedded for search, a redaction pass strips likely secrets — API
keys, JWTs, `.env`-style values, credentials in URLs. Pause capture instantly
from the status bar at any time.

See the in-editor "Welcome to Recall" walkthrough (opens automatically on
first install) for the full picture, including how to try Ask Recall
yourself.
