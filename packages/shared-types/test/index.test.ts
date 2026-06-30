import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  LessonSchema,
  MemoryEventSchema,
  SettingsSchema,
  SkillProfileSchema,
  TombstoneSchema
} from "../src/index.js";

const baseEvent = {
  id: "01J9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9",
  schemaVersion: 1,
  rev: 1,
  tenantId: "local",
  deviceId: "device-1",
  source: "vscode",
  type: "terminal_command",
  occurredAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  payload: { command: "npm test", cwd: "/repo", exitCode: 1, outputExcerpt: "..." },
  embeddingText: "terminal_command | exit=1 | npm test",
  tags: [],
  links: [],
  redacted: true,
  privacy: { pinned: false, excludedFromSync: false }
};

describe("MemoryEventSchema", () => {
  it("accepts a well-formed event", () => {
    expect(() => MemoryEventSchema.parse(baseEvent)).not.toThrow();
  });

  it("rejects an unknown event type", () => {
    expect(() => MemoryEventSchema.parse({ ...baseEvent, type: "bogus" })).toThrow();
  });

  it("rejects a missing privacy block", () => {
    const { privacy: _privacy, ...withoutPrivacy } = baseEvent;
    expect(() => MemoryEventSchema.parse(withoutPrivacy)).toThrow();
  });

  it("stamps embeddingModel/embeddingDim together when present", () => {
    const withEmbedding = {
      ...baseEvent,
      embedding: [0.1, 0.2],
      embeddingModel: "all-MiniLM-L6-v2",
      embeddingDim: 2
    };
    expect(() => MemoryEventSchema.parse(withEmbedding)).not.toThrow();
  });
});

describe("LessonSchema", () => {
  it("accepts a well-formed lesson", () => {
    const lesson = {
      id: "lesson-1",
      schemaVersion: 1,
      rev: 1,
      tenantId: "local",
      title: "Flaky Jest tests from async teardown leaks",
      summary: "Async handles left open after teardown caused intermittent timeouts.",
      sourceEventIds: ["evt-1", "evt-2"],
      tags: ["jest", "flaky-test"],
      embedding: [0.1, 0.2, 0.3],
      embeddingModel: "all-MiniLM-L6-v2",
      embeddingDim: 3,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      usefulnessScore: 0
    };
    expect(() => LessonSchema.parse(lesson)).not.toThrow();
  });
});

describe("TombstoneSchema", () => {
  it("carries no payload", () => {
    const tombstone = {
      id: "evt-1",
      tenantId: "local",
      deletedAt: "2026-07-01T00:00:00.000Z",
      deletedBy: "device-1"
    };
    expect(() => TombstoneSchema.parse(tombstone)).not.toThrow();
  });
});

describe("SkillProfileSchema", () => {
  it("accepts an empty profile", () => {
    const profile = {
      tenantId: "local",
      updatedAt: "2026-07-01T00:00:00.000Z",
      tagFrequencies: {},
      topLanguages: {},
      distinctProblemPatternsResolved: 0
    };
    expect(() => SkillProfileSchema.parse(profile)).not.toThrow();
  });
});

describe("Settings", () => {
  it("has both cloud opt-ins off by default", () => {
    expect(DEFAULT_SETTINGS.syncOptIns.encryptedBackup).toBe(false);
    expect(DEFAULT_SETTINGS.syncOptIns.cloudAssistedSearch).toBe(false);
    expect(() => SettingsSchema.parse(DEFAULT_SETTINGS)).not.toThrow();
  });
});
