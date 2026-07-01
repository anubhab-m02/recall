import { describe, expect, it } from "vitest";
import { extractSearchQuery } from "../../src/background/searchQuery.js";

describe("extractSearchQuery", () => {
  it("extracts a query from a 'q' param", () => {
    expect(extractSearchQuery("https://github.com/search?q=jest+timeout")).toEqual({
      engineOrSite: "github.com",
      query: "jest timeout"
    });
  });

  it("extracts a query from a 'query' param", () => {
    expect(extractSearchQuery("https://npmjs.com/search?query=lodash")).toEqual({
      engineOrSite: "npmjs.com",
      query: "lodash"
    });
  });

  it("returns undefined when there is no recognized search param", () => {
    expect(extractSearchQuery("https://developer.mozilla.org/en-US/docs/Web")).toBeUndefined();
  });

  it("returns undefined for a blank query value", () => {
    expect(extractSearchQuery("https://github.com/search?q=")).toBeUndefined();
  });

  it("returns undefined for an invalid URL", () => {
    expect(extractSearchQuery("not a url")).toBeUndefined();
  });
});
