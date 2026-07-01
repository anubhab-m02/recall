import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteStore } from "../../src/storage/sqlite.js";

describe("SqliteStore", () => {
  let store: SqliteStore;

  beforeEach(() => {
    store = new SqliteStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("returns default settings before any write", () => {
    const settings = store.getSettings();
    expect(settings.capturePaused).toBe(false);
    expect(settings.syncOptIns.encryptedBackup).toBe(false);
  });

  it("persists and round-trips settings", () => {
    const updated = store.setSettings({
      capturePaused: true,
      projectDenylist: ["/secret/repo"],
      domainAllowlist: ["stackoverflow.com"],
      domainDenylist: [],
      syncOptIns: { encryptedBackup: false, cloudAssistedSearch: false }
    });
    expect(updated.capturePaused).toBe(true);
    expect(store.getSettings().capturePaused).toBe(true);
    expect(store.getSettings().projectDenylist).toEqual(["/secret/repo"]);
  });

  it("appends and retrieves audit log entries newest-first", () => {
    store.appendAuditLog("capture.paused", { source: "status-bar" });
    store.appendAuditLog("event.ingested", { type: "terminal_command" });

    const entries = store.getAuditLog();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.action).toBe("event.ingested");
    expect(entries[1]?.action).toBe("capture.paused");
    expect(entries[0]?.detail).toEqual({ type: "terminal_command" });
  });

  it("upserts tombstones idempotently", () => {
    store.upsertTombstone({
      id: "evt-1",
      tenantId: "local",
      deletedAt: "2026-07-01T00:00:00.000Z",
      deletedBy: "device-1"
    });
    store.upsertTombstone({
      id: "evt-1",
      tenantId: "local",
      deletedAt: "2026-07-02T00:00:00.000Z",
      deletedBy: "device-2"
    });

    const tombstones = store.getTombstones();
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0]?.deletedBy).toBe("device-2");
  });

  it("tracks a per-device sync cursor", () => {
    expect(store.getSyncCursor("device-1")).toBeUndefined();
    store.setSyncCursor("device-1", "cursor-abc");
    expect(store.getSyncCursor("device-1")).toBe("cursor-abc");
  });

  it("upserts and fetches a daily standup by date", () => {
    expect(store.getDailyStandupByDate("2026-07-01")).toBeUndefined();

    store.upsertDailyStandup({
      id: "standup-2026-07-01",
      date: "2026-07-01",
      generatedAt: "2026-07-01T09:00:00.000Z",
      draftText: "Yesterday: fixed the flaky test.",
      sourceEventIds: ["evt-1", "evt-2"]
    });

    const fetched = store.getDailyStandupByDate("2026-07-01");
    expect(fetched?.draftText).toBe("Yesterday: fixed the flaky test.");
    expect(fetched?.sourceEventIds).toEqual(["evt-1", "evt-2"]);
    expect(fetched?.finalText).toBeUndefined();
  });

  it("upserting a standup for the same date replaces it rather than duplicating", () => {
    store.upsertDailyStandup({
      id: "standup-2026-07-01",
      date: "2026-07-01",
      generatedAt: "2026-07-01T09:00:00.000Z",
      draftText: "first draft",
      sourceEventIds: []
    });
    store.upsertDailyStandup({
      id: "standup-2026-07-01",
      date: "2026-07-01",
      generatedAt: "2026-07-01T10:00:00.000Z",
      draftText: "regenerated draft",
      finalText: "edited and copied",
      sourceEventIds: ["evt-1"]
    });

    const fetched = store.getDailyStandupByDate("2026-07-01");
    expect(fetched?.draftText).toBe("regenerated draft");
    expect(fetched?.finalText).toBe("edited and copied");
  });

  it("upserts and fetches a weekly summary by weekOf", () => {
    expect(store.getWeeklySummaryByWeekOf("2026-06-29")).toBeUndefined();

    store.upsertWeeklySummary({
      id: "weekly-2026-06-29",
      weekOf: "2026-06-29",
      generatedAt: "2026-07-03T09:00:00.000Z",
      draftText: "This week you worked across 2 repos.",
      highlightedLessonIds: ["lesson-1"]
    });

    const fetched = store.getWeeklySummaryByWeekOf("2026-06-29");
    expect(fetched?.draftText).toBe("This week you worked across 2 repos.");
    expect(fetched?.highlightedLessonIds).toEqual(["lesson-1"]);
  });
});
