import { describe, expect, it } from "vitest";
import { PROMPT_TEMPLATES_PACKAGE_VERSION } from "../src/index.js";

describe("prompt-templates stub", () => {
  it("exports a package version placeholder", () => {
    expect(PROMPT_TEMPLATES_PACKAGE_VERSION).toBe("0.1.0");
  });
});
