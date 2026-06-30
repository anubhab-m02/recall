// Pure helpers backing terminal-command capture (spec FR-1). Kept free of
// `vscode` so it's unit-testable.

export function truncateOutput(chunks: string[], maxChars: number): string {
  return chunks.join("").slice(0, maxChars);
}

export function buildTerminalEmbeddingText(command: string, exitCode: number): string {
  return `terminal_command | exit=${exitCode} | ${command}`;
}
