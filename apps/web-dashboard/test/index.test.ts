import { describe, expect, it } from "vitest";
import { WEB_DASHBOARD_PACKAGE_VERSION } from "../src/index.js";

describe("web-dashboard stub", () => {
  it("exports a package version placeholder", () => {
    expect(WEB_DASHBOARD_PACKAGE_VERSION).toBe("0.1.0");
  });
});
