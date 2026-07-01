// Daily standup generation job (spec FR-20, §7.3): default (default:
// "on first VS Code activation each day", spec FR-20) target date is
// yesterday, the prior workday's events. Always produces a usable draft
// (spec §11.5) even via the extractive fallback — an empty day just says
// so rather than calling the provider on nothing.

import { renderDailyStandupPrompt } from "@recall/prompt-templates";
import type { DailyStandup } from "@recall/shared-types";
import { safeGenerate } from "../generation/safeGenerate.js";
import type { GenerationProvider } from "../generation/provider.js";
import type { LanceDbStore } from "../storage/lancedb.js";
import type { SqliteStore } from "../storage/sqlite.js";
import { dayWindow, yesterdayDate } from "./dateRange.js";

export interface DailyStandupDeps {
  lancedb: LanceDbStore;
  sqlite: SqliteStore;
  provider: GenerationProvider;
}

export async function generateDailyStandup(
  tenantId: string,
  deps: DailyStandupDeps,
  date: string = yesterdayDate()
): Promise<DailyStandup> {
  const { since, until } = dayWindow(date);
  const candidates = await deps.lancedb.scanEventsForSearch({ tenantId, since });
  const dayEvents = candidates.filter((event) => event.occurredAt < until);

  const draftText =
    dayEvents.length > 0
      ? await safeGenerate(
          deps.provider,
          renderDailyStandupPrompt(
            dayEvents.map((e) => ({
              type: e.type,
              occurredAt: e.occurredAt,
              embeddingText: e.embeddingText
            }))
          )
        )
      : "No captured activity for this day.";

  const standup: DailyStandup = {
    id: `standup-${date}`,
    date,
    generatedAt: new Date().toISOString(),
    draftText,
    sourceEventIds: dayEvents.map((e) => e.id)
  };

  return deps.sqlite.upsertDailyStandup(standup);
}
