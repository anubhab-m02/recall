# Manual verification — Phase 5 Browser Extension MVP

Phase 5's Definition of Done (spec §13) needs a real browser loading the
unpacked extension, a real Local Agent, and a real service-worker
lifecycle (kill + wake) — none of which a headless Vitest run can
exercise. The pure logic behind every check here (`domainAllowlist.ts`,
`searchQuery.ts`, `visitTracker.ts`, `eventQueue.ts`, `flushQueue.ts`) has
its own unit tests in `apps/browser-extension/test/`; this script covers
what's left.

## Setup

1. `pnpm install && pnpm build` from the repo root.
2. Start the Local Agent: `pnpm --filter @recall/local-agent exec recall-agent start`
   (or run it via the VS Code extension, which spawns it automatically).
3. Read `~/.recall/agent.json` (`cat ~/.recall/agent.json`) and note the
   `port` and `token` fields — this is the "paired-token flow" spec §13
   Phase 5 calls for, since a browser extension has no filesystem access
   to read the discovery file itself.
4. In Chrome/Edge, go to `chrome://extensions`, enable Developer Mode, and
   "Load unpacked" pointing at `apps/browser-extension/dist`.
5. Open the extension's popup (toolbar icon) and paste the port + token
   from step 3 into the pairing form, then click **Connect**. Confirm the
   popup switches to the status view ("Capture active") — this exercises
   `AgentClient.health()` rejecting a bad port/token before pairing
   persists (SEC-4a: pairing should fail loudly on a wrong token, not
   silently store garbage).

## Checks

1. **Allowlisted domain capture (FR-8)**: visit
   `https://developer.mozilla.org/en-US/docs/Web/JavaScript` and stay on
   the tab for at least 5 seconds (past the 3s minimum dwell threshold in
   `serviceWorker.ts`), then navigate away. Query the agent's audit log
   (`GET http://127.0.0.1:<port>/v1/search?type=page_visit` with the
   `Authorization: Bearer <token>` header, e.g. via `curl`) and confirm a
   `page_visit` entry for that URL appears.
2. **Non-allowlisted domain is not captured (FR-9)**: visit a
   non-allowlisted site (e.g. `https://example.com`) for 5+ seconds, then
   navigate away. Confirm **no** `page_visit` entry for `example.com`
   appears in the same search.
3. **Search query capture (FR-8)**: on an allowlisted site, run a search
   that puts the term in a `q=`/`query=`/`search=` URL parameter (e.g.
   `https://github.com/search?q=jest+timeout&type=code`). Confirm a
   `search_query` entry appears with `engineOrSite: "github.com"` and
   `query: "jest timeout"`.
4. **"Save selection to Recall" (FR-8)**: select some text on any page,
   right-click, choose "Save selection to Recall" from the context menu.
   Confirm a `manual_note` entry appears with that text as its `note`.
5. **Durable queue survives a killed service worker (NFR-REL-2)**: go to
   `chrome://extensions`, click "service worker" under the Recall
   extension to open its DevTools, then in that DevTools console run
   `chrome.runtime.reload()` — or simpler, stop the Local Agent process
   entirely (`Ctrl+C` on `recall-agent start`) — *before* visiting an
   allowlisted page for 5+ seconds. Confirm no event reaches the agent
   (it's down). Restart the agent, then either wait up to a minute for the
   `recall-flush-queue` alarm or reload the extension. Confirm the event
   that was queued while the agent was down now appears in `/v1/search`
   — it was never lost, only delayed, because it lived in IndexedDB
   (`recall-capture-queue` — inspectable via the service worker's
   DevTools > Application > IndexedDB panel) rather than in memory.
6. **Token rejection (SEC-4a)**: `curl` the agent's `/v1/events` endpoint
   with no `Authorization` header, or with an intentionally wrong token.
   Confirm a `401` response (already covered by
   `apps/local-agent/test/server/http.test.ts`'s auth suite — this step
   just confirms it holds for a real running agent, not only the test
   harness).
7. **Pause syncs both surfaces immediately (FR-25)**: click **Pause
   Capture** in the popup. Immediately visit an allowlisted page for 5+
   seconds. Confirm no new `page_visit` entry appears. Then check the VS
   Code status bar (if the extension is also running) — it should show
   "Paused" too, since both surfaces read the same agent-side
   `capturePaused` flag.
8. **Per-domain opt-out (FR-26)**: with capture resumed, open the popup
   while on an allowlisted site (e.g. `github.com`) and click **Disable
   for this domain**. Confirm the popup now reads "Not capturing on
   github.com". Visit a `github.com` page for 5+ seconds and confirm no
   new `page_visit` entry appears, while a different allowlisted domain
   (e.g. `developer.mozilla.org`) still captures normally.

## Pass criteria

Steps 1–2 are the core DoD assertion (allowlisted captured, non-allowlisted
not, verified via the audit log/`/v1/search`). Step 5 is the NFR-REL-2 DoD
assertion (queued events survive a service-worker/agent outage and are
delivered once both come back). Steps 6–7 confirm the two security/privacy
invariants (SEC-4a, FR-25) hold against a real running agent.
