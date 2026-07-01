# Manual verification — Phase 10 Skill evolution & dashboard

Phase 10's Definition of Done (spec §13) is that the dashboard renders
real tag-frequency data from a seeded local dataset. The aggregation
logic (`computeSkillProfile`) and HTTP wiring are covered by automated
tests (`apps/local-agent/test/jobs/skillProfile.test.ts`,
`apps/local-agent/test/server/http.test.ts`), but rendering in an actual
browser — real fetch, real DOM, real bar widths — needs a human look.

## Setup

1. `pnpm install && pnpm build` from the repo root.
2. Start the Local Agent: `recall-agent start`. Note the printed
   `Dashboard: http://127.0.0.1:<port>/dashboard/dashboard.html?token=<token>`
   line.
3. Seed a handful of events with varied tags so the bars have something
   to show, e.g.:
   ```
   curl -X POST http://127.0.0.1:<port>/v1/events \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"tenantId":"local","deviceId":"seed","source":"manual","type":"terminal_command","occurredAt":"2026-07-01T09:00:00.000Z","payload":{"command":"npm test","cwd":"/repo","exitCode":0,"outputExcerpt":""},"embeddingText":"terminal_command | npm test","tags":["typescript","testing"],"context":{"language":"typescript"}}'
   ```
   Repeat with a few different `tags`/`occurredAt` values (some older than
   14 days, some newer) to see both `up`/`down`/`flat` trend arrows.

## Checks

4. Open the printed dashboard URL directly in a browser (no separate
   pairing step needed — the token is in the URL).
5. Confirm the page title is "Recall — Skill Dashboard" and the tag bars
   render, sorted by count descending, widest bar first.
6. Confirm each row shows a trend arrow (▲/▼/▬) consistent with whether
   that tag's activity increased, decreased, or stayed flat in the last
   14 days.
7. Confirm the meta line shows a plausible `distinctProblemPatternsResolved`
   count and an `updated <timestamp>` matching roughly "now."
8. Open the dashboard URL with the token stripped or wrong — confirm it
   fails closed (401 from the underlying API call, not a silent blank
   page pretending to be empty data).
9. `curl http://127.0.0.1:<port>/v1/skill-profile -H "Authorization: Bearer <token>"`
   and confirm the JSON matches what's rendered in the browser.

## Pass criteria

Step 5–7 are the literal DoD: real tag-frequency data, from a real seeded
local dataset, rendered as bars with correct trend indicators — not a
static mock.
