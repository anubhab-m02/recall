// Pure data transform from a SkillProfile into renderable tag-frequency
// bars (spec §13 Phase 10: "visualizing tag frequency trends over time").
// Kept free of the DOM so it's unit-testable — dashboard.ts is the thin
// glue that fetches a SkillProfile and hands it to this, then writes DOM.

import type { SkillProfile } from "@recall/shared-types";

export interface TagBar {
  tag: string;
  count: number;
  trend: "up" | "down" | "flat";
  lastSeen: string;
  widthPercent: number;
}

const MAX_BARS = 20;

export function formatTagBars(profile: SkillProfile): TagBar[] {
  const entries = Object.entries(profile.tagFrequencies);
  if (entries.length === 0) return [];

  const maxCount = Math.max(...entries.map(([, stats]) => stats.count));

  return entries
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, MAX_BARS)
    .map(([tag, stats]) => ({
      tag,
      count: stats.count,
      trend: stats.trend,
      lastSeen: stats.lastSeen,
      widthPercent: maxCount > 0 ? Math.round((stats.count / maxCount) * 100) : 0
    }));
}

const TREND_SYMBOL: Record<TagBar["trend"], string> = { up: "▲", down: "▼", flat: "▬" };

export function trendSymbol(trend: TagBar["trend"]): string {
  return TREND_SYMBOL[trend];
}
