// Default developer-domain allowlist (spec Appendix B), combined with the
// user's own additions (spec FR-9: "additions are explicit, never
// crawled/inferred") and the per-domain opt-out list (FR-26). Kept free of
// `chrome`/DOM globals so it's unit-testable.

export const DEFAULT_DOMAIN_ALLOWLIST: readonly string[] = [
  "stackoverflow.com",
  "stackexchange.com",
  "developer.mozilla.org",
  "github.com",
  "gitlab.com",
  "npmjs.com",
  "pypi.org",
  "crates.io",
  "pkg.go.dev",
  "docs.python.org",
  "learn.microsoft.com",
  "docs.aws.amazon.com",
  "cloud.google.com",
  "kubernetes.io",
  "react.dev",
  "nodejs.org",
  "man7.org"
];

export function extractHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

// A domain entry matches its own hostname and any subdomain (e.g.
// "github.com" matches "docs.github.com"), never the reverse.
function matchesDomain(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase();
  const target = domain.toLowerCase().trim();
  if (!target) return false;
  return host === target || host.endsWith(`.${target}`);
}

export function isDomainAllowed(
  url: string,
  domainAllowlist: readonly string[],
  domainDenylist: readonly string[]
): boolean {
  const hostname = extractHostname(url);
  if (!hostname) return false;
  if (domainDenylist.some((domain) => matchesDomain(hostname, domain))) return false;

  const combined = [...DEFAULT_DOMAIN_ALLOWLIST, ...domainAllowlist];
  return combined.some((domain) => matchesDomain(hostname, domain));
}
