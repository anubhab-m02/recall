// Bundles the extension with esbuild (spec §9) into a CommonJS .cjs file so
// the VS Code extension host can `require()` it regardless of this
// package's own "type": "module" (which governs the authored TS source,
// not the bundled output).

import { build } from "esbuild";

await build({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  outfile: "dist/extension.cjs",
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info"
});
