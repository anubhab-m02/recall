// Skill evolution profile aggregation job (spec FR-22, §7.4, §13 Phase 10):
// a longitudinal, locally-computed aggregation of tags/technologies
// encountered over time. `distinctProblemPatternsResolved` counts
// synthesized `Lesson`s, since a Lesson already represents exactly that —
// a clustered, distinct problem-solving episode (spec FR-15) — rather than
// re-deriving "distinct problem" from raw events.

import type { Lesson, MemoryEvent, SkillProfile } from "@recall/shared-types";
import type { LanceDbStore } from "../storage/lancedb.js";
import type { SqliteStore } from "../storage/sqlite.js";

const TREND_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export interface SkillProfileDeps {
  lancedb: LanceDbStore;
  sqlite: SqliteStore;
}

interface TagStats {
  count: number;
  lastSeen: string;
  recentCount: number;
  previousCount: number;
}

// Pure aggregation — kept separate from I/O so it's directly unit-testable
// against hand-built event/lesson fixtures without a real database.
export function computeSkillProfile(
  tenantId: string,
  events: readonly MemoryEvent[],
  lessons: readonly Lesson[],
  now: Date = new Date()
): SkillProfile {
  const tagStats = new Map<string, TagStats>();
  const topLanguages: Record<string, number> = {};

  const nowMs = now.getTime();
  const recentCutoff = nowMs - TREND_WINDOW_MS;
  const previousCutoff = nowMs - 2 * TREND_WINDOW_MS;

  for (const event of events) {
    const occurredMs = new Date(event.occurredAt).getTime();

    for (const tag of event.tags) {
      const stats = tagStats.get(tag) ?? {
        count: 0,
        lastSeen: event.occurredAt,
        recentCount: 0,
        previousCount: 0
      };
      stats.count += 1;
      if (event.occurredAt > stats.lastSeen) stats.lastSeen = event.occurredAt;
      if (occurredMs >= recentCutoff) stats.recentCount += 1;
      else if (occurredMs >= previousCutoff) stats.previousCount += 1;
      tagStats.set(tag, stats);
    }

    const language = event.context?.language;
    if (language) topLanguages[language] = (topLanguages[language] ?? 0) + 1;
  }

  const tagFrequencies: SkillProfile["tagFrequencies"] = {};
  for (const [tag, stats] of tagStats) {
    const trend =
      stats.recentCount > stats.previousCount
        ? "up"
        : stats.recentCount < stats.previousCount
          ? "down"
          : "flat";
    tagFrequencies[tag] = { count: stats.count, lastSeen: stats.lastSeen, trend };
  }

  return {
    tenantId,
    updatedAt: now.toISOString(),
    tagFrequencies,
    topLanguages,
    distinctProblemPatternsResolved: lessons.length
  };
}

export async function generateSkillProfile(
  tenantId: string,
  deps: SkillProfileDeps,
  now: Date = new Date()
): Promise<SkillProfile> {
  const [events, lessons] = await Promise.all([
    deps.lancedb.scanEventsForSearch({ tenantId }),
    deps.lancedb.scanLessonsForTenant(tenantId)
  ]);
  const profile = computeSkillProfile(tenantId, events, lessons, now);
  return deps.sqlite.setSkillProfile(profile);
}
