// Client-side glue for the local dashboard (spec §13 Phase 10). Plain DOM
// manipulation, no framework/bundler — loaded as a native ES module from
// dashboard.html, same convention already used by the browser extension's
// popup (NodeNext-style `.js`-suffixed relative imports resolve fine as
// real ES modules in a browser). Reads the capability token from the URL
// (the page itself was only reachable because the caller already knew
// that token — see server/http.ts's SEC-4a query-param note) and reuses
// it for the same-origin fetch to /v1/skill-profile.

import type { SkillProfile } from "@recall/shared-types";
import { formatTagBars, trendSymbol } from "./formatTagBars.js";

const token = new URLSearchParams(window.location.search).get("token") ?? "";
const statusEl = document.getElementById("status")!;
const barsEl = document.getElementById("bars")!;
const metaEl = document.getElementById("meta")!;

async function load(): Promise<void> {
  try {
    const res = await fetch(`/v1/skill-profile?token=${encodeURIComponent(token)}`);
    if (!res.ok) {
      statusEl.textContent = `Failed to load skill profile (HTTP ${res.status}).`;
      return;
    }
    const profile = (await res.json()) as SkillProfile;
    render(profile);
  } catch (err) {
    statusEl.textContent = `Failed to reach the Local Agent: ${(err as Error).message}`;
  }
}

function render(profile: SkillProfile): void {
  const bars = formatTagBars(profile);
  statusEl.textContent = "";
  metaEl.textContent = `${profile.distinctProblemPatternsResolved} distinct problem patterns resolved · updated ${new Date(profile.updatedAt).toLocaleString()}`;

  if (bars.length === 0) {
    barsEl.textContent = "No tagged activity captured yet.";
    return;
  }

  barsEl.replaceChildren(
    ...bars.map((bar) => {
      const row = document.createElement("div");
      row.className = "bar-row";

      const label = document.createElement("span");
      label.className = "bar-label";
      label.textContent = `${trendSymbol(bar.trend)} ${bar.tag} (${bar.count})`;

      const track = document.createElement("div");
      track.className = "bar-track";
      const fill = document.createElement("div");
      fill.className = "bar-fill";
      fill.style.width = `${bar.widthPercent}%`;
      track.appendChild(fill);

      row.appendChild(label);
      row.appendChild(track);
      return row;
    })
  );
}

void load();
