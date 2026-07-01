import { describe, expect, it } from "vitest";
import { currentWeekOf, dayWindow, weekWindow, yesterdayDate } from "../../src/jobs/dateRange.js";

describe("dayWindow", () => {
  it("returns the UTC [00:00, 24:00) bounds for a date", () => {
    expect(dayWindow("2026-07-01")).toEqual({
      since: "2026-07-01T00:00:00.000Z",
      until: "2026-07-02T00:00:00.000Z"
    });
  });
});

describe("yesterdayDate", () => {
  it("returns the previous UTC calendar day", () => {
    expect(yesterdayDate(new Date("2026-07-02T15:00:00.000Z"))).toBe("2026-07-01");
  });

  it("rolls back across a month boundary", () => {
    expect(yesterdayDate(new Date("2026-08-01T00:30:00.000Z"))).toBe("2026-07-31");
  });
});

describe("weekWindow", () => {
  it("resolves the Monday-Sunday window containing a mid-week date", () => {
    // 2026-07-01 is a Wednesday.
    expect(weekWindow("2026-07-01")).toEqual({
      weekOf: "2026-06-29",
      since: "2026-06-29T00:00:00.000Z",
      until: "2026-07-06T00:00:00.000Z"
    });
  });

  it("treats a Monday date as the start of its own week", () => {
    expect(weekWindow("2026-06-29").weekOf).toBe("2026-06-29");
  });

  it("treats a Sunday date as the end of the preceding Monday's week", () => {
    expect(weekWindow("2026-07-05").weekOf).toBe("2026-06-29");
  });
});

describe("currentWeekOf", () => {
  it("resolves to the Monday of the week containing `now`", () => {
    expect(currentWeekOf(new Date("2026-07-03T12:00:00.000Z"))).toBe("2026-06-29");
  });
});
