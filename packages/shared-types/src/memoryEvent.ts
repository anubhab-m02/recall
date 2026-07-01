import { z } from "zod";

// Canonical capture unit (spec §7.1). Every capture surface normalizes into
// this shape before storage — downstream code never branches on `source`.

export const MemorySourceSchema = z.enum(["vscode", "browser", "manual"]);
export type MemorySource = z.infer<typeof MemorySourceSchema>;

export const MemoryEventTypeSchema = z.enum([
  "terminal_command",
  "file_edit",
  "debug_session",
  "git_commit",
  "branch_switch",
  "diagnostic_resolved",
  "task_run",
  "search_query",
  "page_visit",
  "manual_note"
]);
export type MemoryEventType = z.infer<typeof MemoryEventTypeSchema>;

export const MemoryEventProjectSchema = z.object({
  repoRoot: z.string().optional(),
  repoRemoteUrl: z.string().optional(),
  branch: z.string().optional()
});

export const MemoryEventContextSchema = z.object({
  filePath: z.string().optional(),
  language: z.string().optional(),
  url: z.string().optional()
});

export const MemoryEventPrivacySchema = z.object({
  pinned: z.boolean(),
  excludedFromSync: z.boolean()
});

// id is a ULID (time-sortable; doubles as creation-order key, spec §7.1).
export const MemoryEventSchema = z.object({
  id: z.string(),
  schemaVersion: z.number().int().nonnegative(),
  rev: z.number().int().nonnegative(),
  tenantId: z.string(),
  deviceId: z.string(),
  source: MemorySourceSchema,
  type: MemoryEventTypeSchema,
  occurredAt: z.string(),
  updatedAt: z.string(),
  project: MemoryEventProjectSchema.optional(),
  context: MemoryEventContextSchema.optional(),
  payload: z.record(z.string(), z.unknown()),
  embeddingText: z.string(),
  embedding: z.array(z.number()).optional(),
  embeddingModel: z.string().optional(),
  embeddingDim: z.number().int().positive().optional(),
  tags: z.array(z.string()),
  links: z.array(z.string()),
  redacted: z.boolean(),
  privacy: MemoryEventPrivacySchema
});
export type MemoryEvent = z.infer<typeof MemoryEventSchema>;

// Subset of fields a capture surface must supply; the agent fills in
// id/schemaVersion/rev/redacted/embedding* during ingestion (spec §8.1
// POST /v1/events: "pre-redaction payload; agent redacts").
export const MemoryEventInputSchema = MemoryEventSchema.omit({
  id: true,
  schemaVersion: true,
  rev: true,
  redacted: true,
  embedding: true,
  embeddingModel: true,
  embeddingDim: true
}).partial({
  updatedAt: true,
  tags: true,
  links: true,
  privacy: true
});
export type MemoryEventInput = z.infer<typeof MemoryEventInputSchema>;

// Type-specific payload shapes (spec §7.1, examples — not exhaustive).
export const TerminalCommandPayloadSchema = z.object({
  command: z.string(),
  cwd: z.string(),
  exitCode: z.number().int(),
  outputExcerpt: z.string()
});

export const FileEditPayloadSchema = z.object({
  diff: z.string(),
  addedLines: z.number().int().nonnegative(),
  removedLines: z.number().int().nonnegative()
});

export const DebugSessionPayloadSchema = z.object({
  launchConfigName: z.string(),
  exceptions: z
    .array(
      z.object({
        message: z.string(),
        stack: z.string()
      })
    )
    .optional()
});

export const GitCommitPayloadSchema = z.object({
  sha: z.string(),
  message: z.string(),
  filesChanged: z.array(z.string()),
  diffStat: z.string()
});

export const BranchSwitchPayloadSchema = z.object({
  fromBranch: z.string().optional(),
  toBranch: z.string()
});

export const DiagnosticResolvedPayloadSchema = z.object({
  filePath: z.string(),
  severity: z.enum(["error", "warning"]),
  message: z.string(),
  resolvedAfterMs: z.number().int().nonnegative().optional()
});

export const TaskRunPayloadSchema = z.object({
  taskName: z.string(),
  taskType: z.string().optional(),
  exitCode: z.number().int().optional()
});

export const SearchQueryPayloadSchema = z.object({
  engineOrSite: z.string(),
  query: z.string()
});

export const PageVisitPayloadSchema = z.object({
  title: z.string(),
  canonicalUrl: z.string(),
  dwellMs: z.number().int().nonnegative(),
  autoSummary: z.string().optional()
});

// Delete propagation record (spec §6.4.1, §7.1). Carries no payload so a
// true local delete (SEC-7) is preserved while sync can still propagate it.
export const TombstoneSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  deletedAt: z.string(),
  deletedBy: z.string()
});
export type Tombstone = z.infer<typeof TombstoneSchema>;
