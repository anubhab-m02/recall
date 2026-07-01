// Resolves the built @recall/web-dashboard package's static assets
// directory (spec §13 Phase 10: "a local-only static page served by the
// Local Agent"). Checks two locations:
//   1. dist/dashboard-static next to the running cli.js — where the
//      bundled build copies web-dashboard's assets at build time (see
//      scripts/copyDashboardAssets.mjs), so a published/npm-installed
//      copy of local-agent (spec §13 Phase 11) doesn't need
//      @recall/web-dashboard as an installed runtime dependency at all.
//   2. `require.resolve`-based workspace lookup — used when running
//      straight from src/ (vitest, ts-node) where the copy step hasn't
//      run and only the pnpm workspace symlink exists.

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export function getWebDashboardDistPath(): string {
  const bundledPath = join(dirname(fileURLToPath(import.meta.url)), "dashboard-static");
  if (existsSync(bundledPath)) return bundledPath;

  const packageJsonPath = require.resolve("@recall/web-dashboard/package.json");
  return join(dirname(packageJsonPath), "dist");
}
