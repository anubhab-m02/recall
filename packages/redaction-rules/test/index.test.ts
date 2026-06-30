import { describe, expect, it } from "vitest";
import { REDACTION_RULES_PACKAGE_VERSION } from "../src/index.js";

describe("redaction-rules stub", () => {
  it("exports a package version placeholder", () => {
    expect(REDACTION_RULES_PACKAGE_VERSION).toBe("0.1.0");
  });
});
