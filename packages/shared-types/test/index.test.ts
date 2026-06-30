import { describe, expect, it } from "vitest";
import { SHARED_TYPES_PACKAGE_VERSION } from "../src/index.js";

describe("shared-types stub", () => {
  it("exports a package version placeholder", () => {
    expect(SHARED_TYPES_PACKAGE_VERSION).toBe("0.1.0");
  });
});
