// tsc only emits compiled .js — the MV3 manifest and the popup's HTML
// shell aren't TypeScript, so they need an explicit copy into dist/ to
// produce a loadable unpacked extension (spec §13 Phase 5 DoD: Playwright
// loads dist/ as an unpacked extension).

import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const assets = ["src/manifest.json", "src/popup/index.html"];

for (const relativePath of assets) {
  const src = join(root, relativePath);
  const dest = join(root, "dist", relativePath.replace(/^src\//, ""));
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}
