// Pure status-bar text formatting (spec FR-25), kept free of `vscode` so
// it's unit-testable.

export interface StatusBarState {
  text: string;
  tooltip: string;
}

// Local midnight, not UTC midnight — a "today" count should match the
// user's actual workday, not roll over mid-afternoon for anyone west of
// UTC.
export function startOfLocalDayIso(now: Date = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

// todayCount is omitted (rather than 0) before the first successful count
// fetch, so a slow/failed request reads as "Active" rather than lying with
// a confident-looking "0 today".
export function formatStatusBarState(paused: boolean, todayCount?: number): StatusBarState {
  const suffix = todayCount !== undefined ? ` · ${todayCount} today` : "";
  return paused
    ? {
        text: "$(circle-slash) Recall: Paused",
        tooltip: "Recall capture is paused. Click to resume."
      }
    : {
        text: `$(record) Recall: Active${suffix}`,
        tooltip: "Recall is capturing. Click to pause."
      };
}
