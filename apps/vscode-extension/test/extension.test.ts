import { describe, expect, it } from "vitest";
import { activatePlaceholder } from "../src/extension.js";

describe("vscode-extension stub", () => {
  it("exposes a placeholder activation identifier", () => {
    expect(activatePlaceholder()).toBe("recall-vscode-extension");
  });
});
