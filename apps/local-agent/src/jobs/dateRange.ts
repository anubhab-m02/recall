// Pure date-window helpers shared by dailyStandup.ts and weeklySummary.ts.
// Kept dependency-free (no Date-library) and easily unit-tested — the
// jobs themselves just need `since`/`until` ISO bounds to filter events.

const MS_PER_DAY = 86_400_000;

export interface DateWindow {
  since: string;
  until: string;
}

// [00:00:00.000, 24:00:00.000) UTC for the given YYYY-MM-DD date.
export function dayWindow(date: string): DateWindow {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start.getTime() + MS_PER_DAY);
  return { since: start.toISOString(), until: end.toISOString() };
}

// Yesterday's date (UTC), as YYYY-MM-DD — the default day a standup
// summarizes (spec FR-20: "the prior workday's events").
export function yesterdayDate(now: Date = new Date()): string {
  const yesterday = new Date(now.getTime() - MS_PER_DAY);
  return yesterday.toISOString().slice(0, 10);
}

// [Monday 00:00:00.000, next Monday) UTC for the week containing `date`.
export function weekWindow(date: string): DateWindow & { weekOf: string } {
  const d = new Date(`${date}T00:00:00.000Z`);
  const dayOfWeek = d.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(d.getTime() - daysSinceMonday * MS_PER_DAY);
  const nextMonday = new Date(monday.getTime() + 7 * MS_PER_DAY);
  return {
    weekOf: monday.toISOString().slice(0, 10),
    since: monday.toISOString(),
    until: nextMonday.toISOString()
  };
}

// The most recently completed week (spec FR-21: "generated every Friday"
// summarizing that week) — defaults to the week containing today, which
// is what a Friday-scheduled run should summarize.
export function currentWeekOf(now: Date = new Date()): string {
  return weekWindow(now.toISOString().slice(0, 10)).weekOf;
}
