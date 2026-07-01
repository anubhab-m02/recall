// node-cron job scheduler (spec §6.2 JOBS) driving clustering, daily
// standup, and weekly summary generation. FR-20 says standups default to
// generating "on first VS Code activation each day" rather than a fixed
// time — the Local Agent doesn't know when that is, so this instead runs
// a cheap hourly check that only actually (re)generates once per day/week,
// keyed off whether a standup/summary already exists for the current
// date/weekOf. clusterIntoLessons runs on its own more frequent interval
// since it's just grouping already-captured events, not a "daily" concept.

import cron, { type ScheduledTask } from "node-cron";
import type { EmbeddingProvider } from "../embeddings/provider.js";
import type { GenerationProvider } from "../generation/provider.js";
import type { LanceDbStore } from "../storage/lancedb.js";
import type { SqliteStore } from "../storage/sqlite.js";
import { clusterIntoLessons } from "./clusterIntoLessons.js";
import { generateDailyStandup } from "./dailyStandup.js";
import { currentWeekOf, yesterdayDate } from "./dateRange.js";
import { generateWeeklySummary } from "./weeklySummary.js";

const CLUSTER_CRON = "*/30 * * * *"; // every 30 minutes
const STANDUP_CRON = "0 * * * *"; // hourly; only regenerates if missing for today
const WEEKLY_CRON = "0 * * * 5"; // hourly on Fridays; only regenerates if missing for this week

export interface SchedulerDeps {
  tenantId: string;
  lancedb: LanceDbStore;
  sqlite: SqliteStore;
  provider: GenerationProvider;
  embeddings: EmbeddingProvider;
}

export interface Scheduler {
  stop(): void;
}

// Exported (rather than kept module-private) so the "only regenerate if
// missing" gating logic can be unit-tested directly against fake deps,
// without waiting on real cron ticks — startScheduler's node-cron wiring
// below is the only genuinely untestable part of this file.

export async function runClusterJob(deps: SchedulerDeps): Promise<void> {
  try {
    await clusterIntoLessons(deps.tenantId, deps);
  } catch (err) {
    console.error("Recall: clusterIntoLessons job failed", err);
  }
}

export async function runStandupJobIfMissing(deps: SchedulerDeps): Promise<void> {
  const date = yesterdayDate();
  if (deps.sqlite.getDailyStandupByDate(date)) return;
  try {
    await generateDailyStandup(deps.tenantId, deps, date);
  } catch (err) {
    console.error("Recall: dailyStandup job failed", err);
  }
}

export async function runWeeklyJobIfMissing(deps: SchedulerDeps): Promise<void> {
  const weekOf = currentWeekOf();
  if (deps.sqlite.getWeeklySummaryByWeekOf(weekOf)) return;
  try {
    await generateWeeklySummary(deps.tenantId, deps, weekOf);
  } catch (err) {
    console.error("Recall: weeklySummary job failed", err);
  }
}

export function startScheduler(deps: SchedulerDeps): Scheduler {
  const tasks: ScheduledTask[] = [
    cron.schedule(CLUSTER_CRON, () => void runClusterJob(deps)),
    cron.schedule(STANDUP_CRON, () => void runStandupJobIfMissing(deps)),
    cron.schedule(WEEKLY_CRON, () => void runWeeklyJobIfMissing(deps))
  ];

  return {
    stop(): void {
      for (const task of tasks) task.stop();
    }
  };
}
