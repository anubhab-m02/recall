import { describe, expect, it } from "vitest";
import { main } from "../src/cli.js";

describe("cli stub", () => {
  it("accepts the documented subcommands", () => {
    expect(main(["node", "cli.js", "start"])).toBe(0);
    expect(main(["node", "cli.js", "mcp"])).toBe(0);
    expect(main(["node", "cli.js", "status"])).toBe(0);
  });

  it("rejects unknown subcommands", () => {
    expect(main(["node", "cli.js", "bogus"])).toBe(1);
  });
});
