import { describe, expect, it } from "vitest";
import { UI_KIT_PACKAGE_VERSION } from "../src/index.js";

describe("ui-kit stub", () => {
  it("exports a package version placeholder", () => {
    expect(UI_KIT_PACKAGE_VERSION).toBe("0.1.0");
  });
});
