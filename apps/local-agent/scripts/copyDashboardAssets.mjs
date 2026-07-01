// Copies @recall/web-dashboard's built static assets into this package's
// own dist/ (spec §13 Phase 10 dashboard, Phase 11 auto-provisioning).
// dashboardStatic.ts resolves this directory relative to the running
// cli.js file rather than via `require.resolve("@recall/web-dashboard")`
// at runtime, so a published/npm-installed copy of local-agent doesn't
// need web-dashboard as an installed runtime dependency — only as a
// workspace devDependency that supplies the build-time asset copy below.

import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const webDashboardPackageJson = require.resolve("@recall/web-dashboard/package.json");
const webDashboardDist = join(dirname(webDashboardPackageJson), "dist");

const dest = join(root, "dist", "dashboard-static");
mkdirSync(dest, { recursive: true });
cpSync(webDashboardDist, dest, { recursive: true });
