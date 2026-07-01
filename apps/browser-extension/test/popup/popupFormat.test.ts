import { describe, expect, it } from "vitest";
import {
  formatCaptureStatus,
  formatDomainToggleButtonLabel,
  formatDomainToggleLabel,
  formatPauseButtonLabel,
  toggleDomainDenylist
} from "../../src/popup/popupFormat.js";

describe("formatPauseButtonLabel", () => {
  it("offers to resume when paused", () => {
    expect(formatPauseButtonLabel(true)).toBe("Resume Capture");
  });

  it("offers to pause when active", () => {
    expect(formatPauseButtonLabel(false)).toBe("Pause Capture");
  });
});

describe("formatCaptureStatus", () => {
  it("reports not connected before pairing", () => {
    expect(formatCaptureStatus(false, false)).toBe("Not connected to Local Agent");
  });

  it("reports paused/active once paired", () => {
    expect(formatCaptureStatus(true, true)).toBe("Capture paused");
    expect(formatCaptureStatus(true, false)).toBe("Capture active");
  });
});

describe("formatDomainToggleLabel", () => {
  it("reports no active tab when hostname is unknown", () => {
    expect(formatDomainToggleLabel(undefined, true)).toBe("No active tab");
  });

  it("reports capturing state for a known hostname", () => {
    expect(formatDomainToggleLabel("github.com", true)).toBe("Capturing on github.com");
    expect(formatDomainToggleLabel("example.com", false)).toBe("Not capturing on example.com");
  });
});

describe("formatDomainToggleButtonLabel", () => {
  it("offers to disable when currently allowed", () => {
    expect(formatDomainToggleButtonLabel(true)).toBe("Disable for this domain");
  });

  it("offers to enable when currently disabled", () => {
    expect(formatDomainToggleButtonLabel(false)).toBe("Enable for this domain");
  });
});

describe("toggleDomainDenylist", () => {
  it("adds the hostname when currently allowed", () => {
    expect(toggleDomainDenylist([], "example.com", true)).toEqual(["example.com"]);
  });

  it("removes the hostname when currently denied", () => {
    expect(toggleDomainDenylist(["example.com", "other.com"], "example.com", false)).toEqual([
      "other.com"
    ]);
  });
});
