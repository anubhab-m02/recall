// Bundles the CLI with esbuild (spec §9, §13 Phase 11) into a single
// dist/cli.js. This inlines the four @recall/* workspace packages
// (shared-types, redaction-rules, prompt-templates — web-dashboard's
// static assets are copied separately, see copyDashboardAssets.mjs)
// so a published `@recall/local-agent` npm package has no "workspace:*"
// dependencies left for a plain `npm install` to choke on (see the
// Phase 11 auto-provisioning DoD in agentSupervisor.ts/agentProvisioner.ts
// on the VS Code extension side). Native addons and other real npm
// dependencies stay external — they're published packages in their own
// right and must be installed normally, not inlined.

import { build } from "esbuild";

await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  outfile: "dist/cli.js",
  external: [
    "@huggingface/transformers",
    "@lancedb/lancedb",
    "@modelcontextprotocol/sdk",
    "better-sqlite3",
    "express",
    "node-cron",
    "ulid",
    "zod"
  ],
  sourcemap: true,
  logLevel: "info"
});
