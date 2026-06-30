import { z } from "zod";

// Daily standup / weekly summary records (spec §7.3).

export const DailyStandupSchema = z.object({
  id: z.string(),
  date: z.string(), // YYYY-MM-DD
  generatedAt: z.string(),
  draftText: z.string(),
  finalText: z.string().optional(),
  sourceEventIds: z.array(z.string())
});
export type DailyStandup = z.infer<typeof DailyStandupSchema>;

export const WeeklySummarySchema = z.object({
  id: z.string(),
  weekOf: z.string(), // YYYY-MM-DD (Monday)
  generatedAt: z.string(),
  draftText: z.string(),
  highlightedLessonIds: z.array(z.string())
});
export type WeeklySummary = z.infer<typeof WeeklySummarySchema>;
