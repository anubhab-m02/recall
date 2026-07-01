import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOMAIN_ALLOWLIST,
  extractHostname,
  isDomainAllowed
} from "../../src/background/domainAllowlist.js";

describe("extractHostname", () => {
  it("extracts the hostname from a URL", () => {
    expect(extractHostname("https://stackoverflow.com/questions/123")).toBe("stackoverflow.com");
  });

  it("returns undefined for an invalid URL", () => {
    expect(extractHostname("not a url")).toBeUndefined();
  });
});

describe("isDomainAllowed", () => {
  it("allows a default-allowlisted domain", () => {
    expect(isDomainAllowed("https://stackoverflow.com/q/1", [], [])).toBe(true);
  });

  it("allows a subdomain of a default-allowlisted domain", () => {
    expect(isDomainAllowed("https://docs.github.com/en", [], [])).toBe(true);
  });

  it("rejects a non-allowlisted domain by default", () => {
    expect(isDomainAllowed("https://example.com/", [], [])).toBe(false);
  });

  it("allows a user-added domain", () => {
    expect(isDomainAllowed("https://internal-docs.acme.com/", ["internal-docs.acme.com"], [])).toBe(
      true
    );
  });

  it("denylist overrides the default allowlist (FR-26 per-domain opt-out)", () => {
    expect(isDomainAllowed("https://stackoverflow.com/q/1", [], ["stackoverflow.com"])).toBe(false);
  });

  it("returns false for an invalid URL", () => {
    expect(isDomainAllowed("not a url", [], [])).toBe(false);
  });

  it("ships a non-empty default list matching spec Appendix B", () => {
    expect(DEFAULT_DOMAIN_ALLOWLIST).toContain("github.com");
    expect(DEFAULT_DOMAIN_ALLOWLIST.length).toBeGreaterThan(10);
  });
});
