import { describe, expect, it } from "vitest";
import type { SkillProfile } from "@recall/shared-types";
import { formatTagBars, trendSymbol } from "../src/formatTagBars.js";

function makeProfile(tagFrequencies: SkillProfile["tagFrequencies"]): SkillProfile {
  return {
    tenantId: "local",
    updatedAt: "2026-07-01T00:00:00.000Z",
    tagFrequencies,
    topLanguages: {},
    distinctProblemPatternsResolved: 0
  };
}

describe("formatTagBars", () => {
  it("returns an empty array for a profile with no tags", () => {
    expect(formatTagBars(makeProfile({}))).toEqual([]);
  });

  it("sorts by count descending and computes width relative to the max", () => {
    const profile = makeProfile({
      typescript: { count: 10, lastSeen: "2026-07-01T00:00:00.000Z", trend: "up" },
      testing: { count: 5, lastSeen: "2026-06-30T00:00:00.000Z", trend: "flat" }
    });

    const bars = formatTagBars(profile);

    expect(bars.map((b) => b.tag)).toEqual(["typescript", "testing"]);
    expect(bars[0].widthPercent).toBe(100);
    expect(bars[1].widthPercent).toBe(50);
  });

  it("caps output at 20 bars", () => {
    const tagFrequencies: SkillProfile["tagFrequencies"] = {};
    for (let i = 0; i < 30; i++) {
      tagFrequencies[`tag-${i}`] = {
        count: 30 - i,
        lastSeen: "2026-07-01T00:00:00.000Z",
        trend: "flat"
      };
    }

    const bars = formatTagBars(makeProfile(tagFrequencies));

    expect(bars).toHaveLength(20);
    expect(bars[0].tag).toBe("tag-0");
  });
});

describe("trendSymbol", () => {
  it("maps each trend to its symbol", () => {
    expect(trendSymbol("up")).toBe("▲");
    expect(trendSymbol("down")).toBe("▼");
    expect(trendSymbol("flat")).toBe("▬");
  });
});
