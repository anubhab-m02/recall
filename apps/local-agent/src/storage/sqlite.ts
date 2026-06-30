// SQLite storage layer (spec §7.5): settings, audit log, sync cursors,
// tombstones, and the DailyStandup/WeeklySummary/SkillProfile rows that
// don't need vector search. Synchronous by design (better-sqlite3) — this
// runs in the same process as the HTTP server and every call here is
// expected to be sub-millisecond (spec §5A.1 latency budgets).

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_SETTINGS, type Settings, type Tombstone } from "@recall/shared-types";

export interface AuditLogEntry {
  id: number;
  timestamp: string;
  action: string;
  detail: unknown;
}

const SCHEMA_VERSION = 1;

export class SqliteStore {
  private readonly db: Database.Database;

  constructor(filePath: string) {
    if (filePath !== ":memory:") {
      mkdirSync(dirname(filePath), { recursive: true });
    }
    this.db = new Database(filePath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  // Forward-only schema migrations (spec §7.6). Real ALTER-based migrations
  // land as the schema evolves past v1; for now this just establishes the
  // v1 tables and stamps schemaVersion.
  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        detail TEXT
      );

      CREATE TABLE IF NOT EXISTS sync_cursors (
        device_id TEXT PRIMARY KEY,
        cursor TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tombstones (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        deleted_at TEXT NOT NULL,
        deleted_by TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS daily_standups (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        draft_text TEXT NOT NULL,
        final_text TEXT,
        source_event_ids TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS weekly_summaries (
        id TEXT PRIMARY KEY,
        week_of TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        draft_text TEXT NOT NULL,
        highlighted_lesson_ids TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS skill_profile (
        tenant_id TEXT PRIMARY KEY,
        updated_at TEXT NOT NULL,
        tag_frequencies TEXT NOT NULL,
        top_languages TEXT NOT NULL,
        distinct_problem_patterns_resolved INTEGER NOT NULL
      );
    `);

    const current = this.db
      .prepare("SELECT value FROM schema_meta WHERE key = 'schemaVersion'")
      .get() as { value: string } | undefined;
    if (!current) {
      this.db
        .prepare("INSERT INTO schema_meta (key, value) VALUES ('schemaVersion', ?)")
        .run(String(SCHEMA_VERSION));
    }
  }

  // --- Settings (spec FR-25/26/28) ---

  getSettings(): Settings {
    const row = this.db.prepare("SELECT json FROM settings WHERE id = 'singleton'").get() as
      { json: string } | undefined;
    if (!row) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(row.json) } as Settings;
  }

  setSettings(settings: Settings): Settings {
    this.db
      .prepare(
        `INSERT INTO settings (id, json) VALUES ('singleton', ?)
         ON CONFLICT(id) DO UPDATE SET json = excluded.json`
      )
      .run(JSON.stringify(settings));
    return settings;
  }

  // --- Audit log (spec SEC-8: "show me everything Recall recorded about me today") ---

  appendAuditLog(action: string, detail: unknown = null): AuditLogEntry {
    const timestamp = new Date().toISOString();
    const result = this.db
      .prepare("INSERT INTO audit_log (timestamp, action, detail) VALUES (?, ?, ?)")
      .run(timestamp, action, detail === null ? null : JSON.stringify(detail));
    return { id: Number(result.lastInsertRowid), timestamp, action, detail };
  }

  getAuditLog(options: { since?: string; limit?: number } = {}): AuditLogEntry[] {
    const limit = options.limit ?? 500;
    const rows = options.since
      ? this.db
          .prepare(
            `SELECT id, timestamp, action, detail FROM audit_log
             WHERE timestamp >= ? ORDER BY id DESC LIMIT ?`
          )
          .all(options.since, limit)
      : this.db
          .prepare("SELECT id, timestamp, action, detail FROM audit_log ORDER BY id DESC LIMIT ?")
          .all(limit);
    return (rows as { id: number; timestamp: string; action: string; detail: string | null }[]).map(
      (row) => ({
        id: row.id,
        timestamp: row.timestamp,
        action: row.action,
        detail: row.detail ? JSON.parse(row.detail) : null
      })
    );
  }

  // --- Tombstones (spec §6.4.1: delete propagation without resurrecting deletes) ---

  upsertTombstone(tombstone: Tombstone): void {
    this.db
      .prepare(
        `INSERT INTO tombstones (id, tenant_id, deleted_at, deleted_by)
         VALUES (@id, @tenantId, @deletedAt, @deletedBy)
         ON CONFLICT(id) DO UPDATE SET deleted_at = excluded.deleted_at, deleted_by = excluded.deleted_by`
      )
      .run(tombstone);
  }

  getTombstones(): Tombstone[] {
    const rows = this.db
      .prepare("SELECT id, tenant_id, deleted_at, deleted_by FROM tombstones")
      .all() as { id: string; tenant_id: string; deleted_at: string; deleted_by: string }[];
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      deletedAt: row.deleted_at,
      deletedBy: row.deleted_by
    }));
  }

  // --- Sync cursors (spec §6.4.1) ---

  getSyncCursor(deviceId: string): string | undefined {
    const row = this.db
      .prepare("SELECT cursor FROM sync_cursors WHERE device_id = ?")
      .get(deviceId) as { cursor: string } | undefined;
    return row?.cursor;
  }

  setSyncCursor(deviceId: string, cursor: string): void {
    this.db
      .prepare(
        `INSERT INTO sync_cursors (device_id, cursor, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(device_id) DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at`
      )
      .run(deviceId, cursor, new Date().toISOString());
  }

  close(): void {
    this.db.close();
  }
}
