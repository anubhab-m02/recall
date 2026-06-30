import { z } from "zod";

// Longitudinal skill evolution aggregation (spec §7.4).

export const TagFrequencySchema = z.object({
  count: z.number().int().nonnegative(),
  lastSeen: z.string(),
  trend: z.enum(["up", "down", "flat"])
});
export type TagFrequency = z.infer<typeof TagFrequencySchema>;

export const SkillProfileSchema = z.object({
  tenantId: z.string(),
  updatedAt: z.string(),
  tagFrequencies: z.record(z.string(), TagFrequencySchema),
  topLanguages: z.record(z.string(), z.number().int().nonnegative()),
  distinctProblemPatternsResolved: z.number().int().nonnegative()
});
export type SkillProfile = z.infer<typeof SkillProfileSchema>;
