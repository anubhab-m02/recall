import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acquireLock,
  loadOrCreateToken,
  readDiscoveryFile,
  releaseLock,
  removeDiscoveryFile,
  SingleInstanceLockError,
  tokensMatch,
  writeDiscoveryFile
} from "../src/agentLifecycle.js";
import { getAgentLockPath } from "../src/paths.js";

describe("agentLifecycle", () => {
  let dir: string;
  let previousHome: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "recall-lifecycle-"));
    previousHome = process.env.RECALL_HOME;
    process.env.RECALL_HOME = dir;
  });

  afterEach(() => {
    if (previousHome === undefined) {
      delete process.env.RECALL_HOME;
    } else {
      process.env.RECALL_HOME = previousHome;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  describe("acquireLock / releaseLock", () => {
    it("acquires the lock when none is held", () => {
      expect(() => acquireLock()).not.toThrow();
      releaseLock();
    });

    it("rejects a second acquire while the current process holds it", () => {
      acquireLock();
      expect(() => acquireLock()).toThrow(SingleInstanceLockError);
      releaseLock();
    });

    it("reclaims a stale lock left by a dead pid", () => {
      const deadPid = 999999;
      writeFileSync(getAgentLockPath(), String(deadPid), { mode: 0o600 });
      expect(() => acquireLock()).not.toThrow();
      releaseLock();
    });
  });

  describe("loadOrCreateToken", () => {
    it("generates a token once and persists it across calls", () => {
      const first = loadOrCreateToken();
      const second = loadOrCreateToken();
      expect(first).toBe(second);
      expect(first.length).toBeGreaterThanOrEqual(32);
    });
  });

  describe("tokensMatch", () => {
    it("matches identical tokens", () => {
      expect(tokensMatch("abc123", "abc123")).toBe(true);
    });

    it("rejects a different token of the same length", () => {
      expect(tokensMatch("abc123", "abc124")).toBe(false);
    });

    it("rejects tokens of different lengths without throwing", () => {
      expect(tokensMatch("short", "a-much-longer-token-value")).toBe(false);
    });
  });

  describe("discovery file", () => {
    it("round-trips and clears", () => {
      expect(readDiscoveryFile()).toBeUndefined();

      writeDiscoveryFile({
        port: 47811,
        pid: process.pid,
        token: "test-token",
        startedAt: "2026-07-01T00:00:00.000Z",
        version: "0.1.0"
      });

      const discovery = readDiscoveryFile();
      expect(discovery?.port).toBe(47811);
      expect(discovery?.token).toBe("test-token");

      removeDiscoveryFile();
      expect(readDiscoveryFile()).toBeUndefined();
    });
  });
});
