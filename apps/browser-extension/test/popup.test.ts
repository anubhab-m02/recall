import { describe, expect, it } from "vitest";
import { popupPlaceholder } from "../src/popup/Popup.js";

describe("browser-extension stub", () => {
  it("exposes a placeholder popup identifier", () => {
    expect(popupPlaceholder()).toBe("recall-popup");
  });
});
