// Resolves the built @recall/web-dashboard package's static assets
// directory (spec §13 Phase 10: "a local-only static page served by the
// Local Agent"). Uses Node module resolution rather than a relative path
// so this keeps working regardless of how the two packages are laid out
// relative to each other on disk (workspace symlink vs. a future packaged
// install).

import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

export function getWebDashboardDistPath(): string {
  const packageJsonPath = require.resolve("@recall/web-dashboard/package.json");
  return join(dirname(packageJsonPath), "dist");
}
