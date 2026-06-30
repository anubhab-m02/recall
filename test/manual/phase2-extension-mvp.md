# Manual verification — Phase 2 VS Code Extension MVP

Phase 2's Definition of Done (spec §13) is a real Extension Development Host
check that no headless test runner can exercise. Run this after any change
to `apps/vscode-extension` or the Phase 1 Local Agent endpoints it depends
on.

## Setup

1. `pnpm install && pnpm build` from the repo root.
2. Make `recall-agent` resolvable on `PATH` for the spawn-on-activation path
   to work, e.g. `pnpm --filter @recall/local-agent link --global` (or run
   `recall-agent start` yourself first — the extension detects an
   already-running agent via `~/.recall/agent.json` and won't spawn a
   second one).
3. Open `apps/vscode-extension` in VS Code and press `F5` (or
   `Run > Start Debugging`) to launch the Extension Development Host.

## Checks

1. **Activation**: the "Recall" output channel (`View > Output`, select
   "Recall" from the dropdown) should log `Recall Local Agent ready on
   port <N>` followed by `Recall extension activated.` within ~10s.
2. **Walkthrough**: on first run, the "Welcome to Recall" walkthrough opens
   automatically. Confirm the three steps render and the "Test Redaction"
   link in step 3 runs `Recall: Test Redaction`.
3. **File-save capture (FR-2)**: edit and save a file in the dev host. Open
   the Recall sidebar (activity bar icon) and confirm a `file_edit` entry
   appears within ~10s (the sidebar's auto-refresh interval).
4. **Terminal capture (FR-1)**: open an integrated terminal with shell
   integration enabled and run a command (e.g. `echo hello`). Confirm a
   `terminal_command` entry appears in the sidebar with the right exit code.
5. **Manual capture (FR-7)**: run `Recall: Save as Memory`, enter a note and
   tags, confirm the "Saved to Recall" toast and a `manual_note` entry in
   the sidebar.
6. **Search**: click the search icon in the sidebar's title bar
   (`Recall: Search My Memory`), enter a term matching one of the captured
   events, confirm the list filters down to matches.
7. **Pause/resume (FR-25)**: click the Recall status bar item, confirm it
   flips to "Paused", make another file save, confirm **no** new entry
   appears in the sidebar. Click again to resume.
8. **Redaction (SEC-3, FR-12)**: paste a fake secret into a file
   (e.g. `AWS_KEY=AKIAIOSFODNN7EXAMPLE`) and save it. Inspect
   `~/.recall/lancedb` directly (or run `Recall: Test Redaction` with the
   same text) and confirm the literal secret string never appears — only
   a `[REDACTED:<rule>]` placeholder.

If any step fails, check the "Recall" output channel first — capture
failures are logged to `console.error` and surfaced there, not as toasts,
so they don't interrupt typing.
