// Pure helpers backing diagnostics-resolved capture (spec FR-5): tracks
// error/warning diagnostics per file and detects when a previously-seen
// one disappears (i.e. was fixed). Kept free of `vscode` so it's
// unit-testable — VS Code's DiagnosticSeverity enum values (Error=0,
// Warning=1) are mirrored here rather than imported.

export type DiagnosticSeverityLabel = "error" | "warning";

export interface TrackedDiagnostic {
  key: string;
  severity: DiagnosticSeverityLabel;
  message: string;
  firstSeenAt: number;
}

export interface CurrentDiagnostic {
  key: string;
  severity: DiagnosticSeverityLabel;
  message: string;
}

export function severityLabel(severity: number): DiagnosticSeverityLabel | undefined {
  if (severity === 0) return "error";
  if (severity === 1) return "warning";
  return undefined;
}

export function diagnosticKey(line: number, character: number, message: string): string {
  return `${line}:${character}:${message}`;
}

export function computeResolvedDiagnostics(
  previous: Map<string, TrackedDiagnostic>,
  current: CurrentDiagnostic[],
  now: number
): { next: Map<string, TrackedDiagnostic>; resolved: TrackedDiagnostic[] } {
  const currentKeys = new Set(current.map((c) => c.key));
  const resolved: TrackedDiagnostic[] = [];
  for (const [key, tracked] of previous) {
    if (!currentKeys.has(key)) resolved.push(tracked);
  }

  const next = new Map<string, TrackedDiagnostic>();
  for (const c of current) {
    next.set(c.key, previous.get(c.key) ?? { ...c, firstSeenAt: now });
  }

  return { next, resolved };
}
