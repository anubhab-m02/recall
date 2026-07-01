// Weekly learning summary generation job (spec FR-21, §7.3): synthesized
// from the week's Lessons and daily standups, not raw events. Falls back
// to the week's daily standups if no Lessons exist yet (e.g.
// clusterIntoLessons hasn't produced any, or ran after this), so the
// summary is never empty just because clustering happened to lag behind.

import { renderWeeklySummaryPrompt } from "@recall/prompt-templates";
import type { WeeklySummary } from "@recall/shared-types";
import { safeGenerate } from "../generation/safeGenerate.js";
import type { GenerationProvider } from "../generation/provider.js";
import type { LanceDbStore } from "../storage/lancedb.js";
import type { SqliteStore } from "../storage/sqlite.js";
import { currentWeekOf, weekWindow } from "./dateRange.js";

export interface WeeklySummaryDeps {
  lancedb: LanceDbStore;
  sqlite: SqliteStore;
  provider: GenerationProvider;
}

export async function generateWeeklySummary(
  tenantId: string,
  deps: WeeklySummaryDeps,
  weekOf: string = currentWeekOf()
): Promise<WeeklySummary> {
  const { since, until } = weekWindow(weekOf);

  const lessons = (await deps.lancedb.scanLessonsForTenant(tenantId)).filter(
    (lesson) => lesson.createdAt >= since && lesson.createdAt < until
  );

  const items =
    lessons.length > 0
      ? lessons.map((lesson) => ({
          label: "lesson",
          occurredAt: lesson.createdAt,
          text: `${lesson.title} — ${lesson.summary}`
        }))
      : weekDates(since, until)
          .map((date) => deps.sqlite.getDailyStandupByDate(date))
          .filter((standup) => standup !== undefined)
          .map((standup) => ({
            label: "daily standup",
            occurredAt: standup.date,
            text: standup.draftText
          }));

  const draftText =
    items.length > 0
      ? await safeGenerate(deps.provider, renderWeeklySummaryPrompt(items))
      : "No activity captured this week.";

  const summary: WeeklySummary = {
    id: `weekly-${weekOf}`,
    weekOf,
    generatedAt: new Date().toISOString(),
    draftText,
    highlightedLessonIds: lessons.map((lesson) => lesson.id)
  };

  return deps.sqlite.upsertWeeklySummary(summary);
}

function weekDates(sinceIso: string, untilIso: string): string[] {
  const dates: string[] = [];
  const MS_PER_DAY = 86_400_000;
  for (let t = new Date(sinceIso).getTime(); t < new Date(untilIso).getTime(); t += MS_PER_DAY) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}
