# Manual verification — Phase 4 proactive surfacing

Phase 4's Definition of Done (spec §13) is reproducing Section 4, journey 2
("In-context resurfacing") end-to-end: a past debugging session must
resurface unprompted, in the sidebar, while the user is looking at a
similar problem — no explicit query. This can't be exercised by a headless
test runner because it depends on real VS Code editor/diagnostics/terminal
events and the debounced UI wiring in `ui/proactiveContext.ts`. Run this
after any change to `apps/vscode-extension/src/capture/*`,
`apps/vscode-extension/src/ui/proactiveContext.ts`, or
`apps/local-agent/src/retrieval/relatedContext.ts`.

## Setup

1. `pnpm install && pnpm build` from the repo root.
2. Open `apps/vscode-extension` in VS Code and press `F5` to launch the
   Extension Development Host, with some project folder open in that host
   (any small repo works — this script uses a Jest/Node project as the
   worked example, matching Section 4's journey).

## Part A — seed a "past" memory (playing Priya, two months ago)

1. In the Extension Development Host, open an integrated terminal and run
   a command that fails with a distinctive, reproducible error, e.g.:
   ```
   npx jest --testTimeout=1 someSlowTest
   ```
   (or simulate it: `node -e "console.error('Jest test suite timed out after 5000ms - Timeout of 5000ms exceeded waiting for async callback'); process.exit(1)"`)
2. Confirm a `terminal_command` entry for it appears in the Recall sidebar
   (spec FR-1, already covered by the Phase 2 script) — this is the memory
   Diego will later rediscover.
3. Optionally back-date it: `Recall: Search My Memory` won't show timestamps
   from the future, but for a truer "two months ago" simulation you can
   directly patch the event's `occurredAt` via `POST /v1/events` against
   the running agent instead of the terminal (see Part C for the raw HTTP
   approach) — not required for this script to pass.

## Part B — deeper capture types added this phase

4. **Debug session capture (FR-3)**: add a `.vscode/launch.json` debug
   config to the open project, set a breakpoint, and run
   `Run > Start Debugging`. Let it hit the breakpoint and throw an
   exception if the config supports it, then stop the session. Confirm a
   `debug_session` entry appears in the sidebar with the launch config name.
5. **Git capture (FR-4)**: in the dev host's integrated terminal, make a
   commit (`git commit -am "test commit"`) and switch branches
   (`git checkout -b recall-test`). Confirm both a `git_commit` entry (with
   the commit message) and a `branch_switch` entry appear in the sidebar.
6. **Task run capture (FR-6)**: add a `.vscode/tasks.json` task (or use an
   existing `npm` script via `Terminal > Run Task`) and run it to
   completion. Confirm a `task_run` entry appears with the right exit code.
7. **Diagnostics-resolved capture (FR-5)**: introduce a TypeScript/ESLint
   error in an open file (e.g. reference an undefined variable), save, wait
   for the error to appear in the Problems panel, then fix it and save
   again. Confirm a `diagnostic_resolved` entry appears in the sidebar once
   the error clears — not before.

## Part C — the actual DoD: proactive resurfacing (playing Diego, today)

8. Open a **different** file and, in the integrated terminal, reproduce a
   similar-but-not-identical failure to Part A step 1 — same class of
   problem (a hanging/timing-out test), different wording, e.g.:
   ```
   node -e "console.error('Timeout - Async callback was not invoked within the 5000ms timeout'); process.exit(1)"
   ```
9. Within ~1 second (the 500ms debounce in `proactiveContext.ts`), without
   running `Recall: Search My Memory` or typing anything, check the Recall
   sidebar: it should now show the Part A `terminal_command` memory (or
   rank it highly) among the results, pushed there via
   `GET /v1/context/related`, not the explicit search path.
10. Repeat the trigger via a second path — switch the active editor to the
    file most related to the failure and confirm the sidebar updates again
    on the editor-change trigger alone (no new terminal command).
11. **CodeLens ("Similar past issue")**: open the file that most resembles
    the Part A failure (e.g. the test file itself) and confirm a
    `Recall: Similar past issue — ...` CodeLens appears above the first
    line once `/v1/context/related` returns a match for that file. Click it
    and confirm it opens `Recall: Search My Memory`.

## Pass criteria

- Step 9 is the core DoD assertion: a semantically related past memory
  appears in the sidebar **without an explicit query**, driven by a
  terminal-failure trigger.
- Step 10 confirms the same proactive path also fires on plain navigation
  (active editor change), not just terminal failures.
- Step 11 confirms the CodeLens annotation surfaces the same signal
  in-editor, one click away from a full search.

If any step fails, check the "Recall" output channel — proactive-context
and CodeLens failures are logged via `console.error` (`Recall: failed to
fetch proactive related context` / silently return no lenses), not
surfaced as toasts, so a slow or unreachable agent degrades quietly rather
than interrupting the editor.
