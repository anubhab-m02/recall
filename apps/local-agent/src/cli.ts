#!/usr/bin/env node
// Phase 1 stub. `recall-agent start|mcp|status` CLI entrypoint (spec §9, §13).

export function main(argv: string[]): number {
  const command = argv[2];
  if (command === "start" || command === "mcp" || command === "status") {
    // Real implementation lands in Phase 1 (start/status) and Phase 7 (mcp).
    return 0;
  }
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv);
}
