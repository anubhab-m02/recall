// Pure helper backing debug-session capture (spec FR-3). Kept free of
// `vscode` so it's unit-testable.

export interface DebugException {
  message: string;
  stack: string;
}

export function buildDebugSessionEmbeddingText(
  launchConfigName: string,
  exceptions: DebugException[] | undefined
): string {
  const exceptionSummary = exceptions?.length
    ? ` | ${exceptions.map((e) => e.message).join("; ")}`
    : "";
  return `debug_session | ${launchConfigName}${exceptionSummary}`;
}
