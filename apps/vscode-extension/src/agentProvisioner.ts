// Pure, vscode-free helpers for auto-provisioning the Local Agent when
// `recall-agent` isn't already on PATH (spec §13 Phase 11 DoD: a clean
// machine with only the .vsix installed must reach "first captured
// memory" with no manual terminal steps). Kept separate from
// agentSupervisor.ts (which does the actual spawning) so the path/arg
// logic is directly unit-testable — see agentClient.ts's header comment
// for why `vscode` imports can't be unit tested directly.
//
// Approach: `npm install @recall/local-agent` into a directory the
// extension already owns (VS Code's per-extension globalStorage path),
// scoped with `--prefix` so it never needs admin/sudo the way a `-g`
// install would. This assumes the user already has Node.js/npm on their
// machine (a reasonable prerequisite for an npm-distributed dev tool) —
// it does NOT bundle native addons (better-sqlite3, @lancedb/lancedb)
// into the .vsix, which would require a per-OS/arch/Electron-ABI build
// matrix this project can't verify without those machines.

import { join } from "node:path";

export const AGENT_PACKAGE_NAME = "@recall/local-agent";

export function npmExecutableName(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? "npm.cmd" : "npm";
}

export function nodeExecutableName(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? "node.exe" : "node";
}

// Directory the provisioned copy of the agent is installed into, scoped
// under the extension's own global storage so it never touches any
// global npm prefix and needs no elevated permissions.
export function provisionDir(globalStorageDir: string): string {
  return join(globalStorageDir, "provisioned-agent");
}

export function provisionedCliPath(globalStorageDir: string): string {
  return join(
    provisionDir(globalStorageDir),
    "node_modules",
    "@recall",
    "local-agent",
    "dist",
    "cli.js"
  );
}

export function npmInstallArgs(globalStorageDir: string): string[] {
  return [
    "install",
    `${AGENT_PACKAGE_NAME}@latest`,
    "--prefix",
    provisionDir(globalStorageDir),
    "--no-save",
    "--omit=dev",
    "--no-audit",
    "--no-fund"
  ];
}
