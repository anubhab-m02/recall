// tsc only emits compiled .js — dashboard.html isn't TypeScript, so it
// needs an explicit copy into dist/ (spec §13 Phase 10 DoD: the Local
// Agent serves this dist/ as a static site at /dashboard).

import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const assets = ["src/dashboard.html"];

for (const relativePath of assets) {
  const src = join(root, relativePath);
  const dest = join(root, "dist", relativePath.replace(/^src\//, ""));
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}
