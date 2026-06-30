import { z } from "zod";

// Synthesized knowledge unit (spec §7.2). Always links back to source
// MemoryEvents via sourceEventIds for provenance.

export const LessonSchema = z.object({
  id: z.string(),
  schemaVersion: z.number().int().nonnegative(),
  rev: z.number().int().nonnegative(),
  tenantId: z.string(),
  title: z.string(),
  summary: z.string(),
  whatWorked: z.string().optional(),
  whatDidntWork: z.string().optional(),
  sourceEventIds: z.array(z.string()),
  tags: z.array(z.string()),
  embedding: z.array(z.number()),
  embeddingModel: z.string(),
  embeddingDim: z.number().int().positive(),
  project: z
    .object({
      repoRoot: z.string().optional()
    })
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  usefulnessScore: z.number()
});
export type Lesson = z.infer<typeof LessonSchema>;
