import { describe, expect, it } from "vitest";
import {
  computeResolvedDiagnostics,
  diagnosticKey,
  severityLabel,
  type TrackedDiagnostic
} from "../../src/capture/diagnosticsUtils.js";

describe("severityLabel", () => {
  it("maps VS Code's DiagnosticSeverity values to labels", () => {
    expect(severityLabel(0)).toBe("error");
    expect(severityLabel(1)).toBe("warning");
  });

  it("returns undefined for Information/Hint severities", () => {
    expect(severityLabel(2)).toBeUndefined();
    expect(severityLabel(3)).toBeUndefined();
  });
});

describe("diagnosticKey", () => {
  it("combines position and message into a stable key", () => {
    expect(diagnosticKey(4, 2, "Cannot find name 'foo'")).toBe("4:2:Cannot find name 'foo'");
  });
});

describe("computeResolvedDiagnostics", () => {
  it("reports nothing resolved when nothing was previously tracked", () => {
    const { next, resolved } = computeResolvedDiagnostics(
      new Map(),
      [{ key: "1:1:err", severity: "error", message: "err" }],
      1000
    );
    expect(resolved).toEqual([]);
    expect(next.get("1:1:err")?.firstSeenAt).toBe(1000);
  });

  it("detects a diagnostic that disappeared as resolved", () => {
    const previous = new Map<string, TrackedDiagnostic>([
      ["1:1:err", { key: "1:1:err", severity: "error", message: "err", firstSeenAt: 500 }]
    ]);

    const { next, resolved } = computeResolvedDiagnostics(previous, [], 1500);

    expect(resolved).toEqual([
      { key: "1:1:err", severity: "error", message: "err", firstSeenAt: 500 }
    ]);
    expect(next.size).toBe(0);
  });

  it("preserves firstSeenAt for diagnostics still present", () => {
    const previous = new Map<string, TrackedDiagnostic>([
      ["1:1:err", { key: "1:1:err", severity: "error", message: "err", firstSeenAt: 500 }]
    ]);

    const { next, resolved } = computeResolvedDiagnostics(
      previous,
      [{ key: "1:1:err", severity: "error", message: "err" }],
      1500
    );

    expect(resolved).toEqual([]);
    expect(next.get("1:1:err")?.firstSeenAt).toBe(500);
  });
});
