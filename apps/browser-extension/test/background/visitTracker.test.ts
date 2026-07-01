import { describe, expect, it } from "vitest";
import { VisitTracker } from "../../src/background/visitTracker.js";

describe("VisitTracker", () => {
  it("computes dwellMs between start and end", () => {
    const tracker = new VisitTracker();
    tracker.start(1, "https://developer.mozilla.org/x", "MDN", 1000);
    const visit = tracker.end(1, 4500);
    expect(visit).toEqual({
      canonicalUrl: "https://developer.mozilla.org/x",
      title: "MDN",
      dwellMs: 3500
    });
  });

  it("returns undefined when ending an untracked tab", () => {
    const tracker = new VisitTracker();
    expect(tracker.end(99, 1000)).toBeUndefined();
  });

  it("clears state after end so a second end() call returns undefined", () => {
    const tracker = new VisitTracker();
    tracker.start(1, "https://github.com", "GitHub", 0);
    tracker.end(1, 1000);
    expect(tracker.end(1, 2000)).toBeUndefined();
  });

  it("tracks multiple tabs independently", () => {
    const tracker = new VisitTracker();
    tracker.start(1, "https://github.com", "GitHub", 0);
    tracker.start(2, "https://npmjs.com", "npm", 100);

    expect(tracker.end(2, 600)).toEqual({
      canonicalUrl: "https://npmjs.com",
      title: "npm",
      dwellMs: 500
    });
    expect(tracker.end(1, 1000)).toEqual({
      canonicalUrl: "https://github.com",
      title: "GitHub",
      dwellMs: 1000
    });
  });
});
