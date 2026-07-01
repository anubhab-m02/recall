// Pure helper backing task-run capture (spec FR-6). Kept free of `vscode`
// so it's unit-testable.

export function buildTaskRunEmbeddingText(taskName: string, exitCode: number | undefined): string {
  return `task_run | exit=${exitCode ?? "unknown"} | ${taskName}`;
}
