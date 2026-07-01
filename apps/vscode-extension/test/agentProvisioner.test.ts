import { describe, expect, it } from "vitest";
import {
  npmExecutableName,
  nodeExecutableName,
  npmInstallArgs,
  provisionDir,
  provisionedCliPath
} from "../src/agentProvisioner.js";

describe("agentProvisioner", () => {
  it("uses the .cmd suffix for npm/node only on win32", () => {
    expect(npmExecutableName("win32")).toBe("npm.cmd");
    expect(npmExecutableName("darwin")).toBe("npm");
    expect(npmExecutableName("linux")).toBe("npm");

    expect(nodeExecutableName("win32")).toBe("node.exe");
    expect(nodeExecutableName("darwin")).toBe("node");
  });

  it("scopes the provisioned install under the extension's own global storage dir", () => {
    const dir = provisionDir("/Users/dev/Library/Application Support/Code/globalStorage/recall");
    expect(dir).toBe(
      "/Users/dev/Library/Application Support/Code/globalStorage/recall/provisioned-agent"
    );
  });

  it("resolves the provisioned cli.js under node_modules/@recall/local-agent/dist", () => {
    const cliPath = provisionedCliPath("/storage");
    expect(cliPath).toBe(
      "/storage/provisioned-agent/node_modules/@recall/local-agent/dist/cli.js"
    );
  });

  it("builds an npm install that never touches a global prefix and needs no admin rights", () => {
    const args = npmInstallArgs("/storage");
    expect(args).toContain("--prefix");
    expect(args).toContain("/storage/provisioned-agent");
    expect(args).not.toContain("-g");
    expect(args).not.toContain("--global");
    expect(args).toContain("@recall/local-agent@latest");
  });
});
