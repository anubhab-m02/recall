import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";

describe("cli", () => {
  let dir: string;
  let previousHome: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "recall-cli-"));
    previousHome = process.env.RECALL_HOME;
    process.env.RECALL_HOME = dir;
  });

  afterEach(() => {
    if (previousHome === undefined) {
      delete process.env.RECALL_HOME;
    } else {
      process.env.RECALL_HOME = previousHome;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("status reports not running when no agent has started", async () => {
    expect(await main(["node", "cli.js", "status"])).toBe(1);
  });

  it("mcp is a recognized, no-op Phase 7 stub", async () => {
    expect(await main(["node", "cli.js", "mcp"])).toBe(0);
  });

  it("rejects unknown subcommands", async () => {
    expect(await main(["node", "cli.js", "bogus"])).toBe(1);
  });
});
