import { describe, expect, it } from "vitest";
import { findSecrets, redactText } from "../src/index.js";

// Fixtures are synthetic / well-known documentation examples — never real
// credentials — used to validate each secret pattern class (spec §13
// Phase 1 DoD).
const FIXTURES: Record<string, string> = {
  jwt: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
  "aws-access-key": "AKIAIOSFODNN7EXAMPLE",
  "github-token": "ghp_1234567890abcdefghijklmnopqrstuvwxyz12",
  "slack-token": "xoxb-test-fixture-not-a-real-token-000000",
  "stripe-key": "sk_test_FIXTURENOTREALZZZZZZZZZZZZ",
  "google-api-key": "AIzaSyD-1234567890abcdefghijklmnopqrstuv",
  "private-key-block":
    "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu\n-----END RSA PRIVATE KEY-----",
  "url-credentials": "postgres://admin:SuperSecretPass1@db.example.com:5432/mydb",
  "dotenv-secret": "DATABASE_SECRET=abcdef123456zyxwvu",
  "generic-secret-assignment": "api_key: 'sk-abcdefghij1234567890'",
  "high-entropy-token": "Zx8aQ29sTmP4rL7vK0wXe6dC1bU3yH5gJ9nF2qS8tR4uV6oW1zA7iC0l"
};

describe("findSecrets", () => {
  for (const [rule, fixture] of Object.entries(FIXTURES)) {
    it(`detects a ${rule} fixture`, () => {
      const findings = findSecrets(fixture);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings.some((f) => f.rule === rule)).toBe(true);
    });

    it(`redacts the ${rule} fixture out of the text entirely`, () => {
      const redacted = redactText(fixture);
      // The exact secret value must never survive redaction (SEC-3).
      const secretSpan = findSecrets(fixture)[0]?.match;
      expect(secretSpan).toBeDefined();
      expect(redacted).not.toContain(secretSpan);
      expect(redacted).toContain("[REDACTED:");
    });
  }

  it("does not flag ordinary prose", () => {
    const prose =
      "The quick brown fox jumps over the lazy dog. This is just a normal sentence " +
      "describing a debugging session with no credentials in it whatsoever.";
    expect(findSecrets(prose)).toHaveLength(0);
  });

  it("does not flag a typical file path", () => {
    const text = "Opened /Users/dev/projects/recall/apps/local-agent/src/cli.ts at line 42";
    expect(findSecrets(text)).toHaveLength(0);
  });

  it("does not flag a typical npm package name or semver range", () => {
    const text = "Installed @typescript-eslint/eslint-plugin@^8.19.0 via pnpm";
    expect(findSecrets(text)).toHaveLength(0);
  });

  it("merges overlapping findings into a single span", () => {
    const text = `token: '${FIXTURES.jwt}'`;
    const findings = findSecrets(text);
    // generic-secret-assignment and jwt both match here; only the
    // earliest/longest accepted span should survive, not both.
    const overlapping = findings.filter((f, _i, all) =>
      all.some((g) => g !== f && g.index < f.index + f.length && f.index < g.index + g.length)
    );
    expect(overlapping).toHaveLength(0);
  });
});

describe("redactText", () => {
  it("is a no-op on text with no secrets", () => {
    const text = "Ran npm test and 12 tests passed.";
    expect(redactText(text)).toBe(text);
  });

  it("preserves surrounding context around a redacted secret", () => {
    const text = `export ${FIXTURES["dotenv-secret"]}`;
    const redacted = redactText(text);
    expect(redacted.startsWith("export ")).toBe(true);
    expect(redacted).not.toContain("abcdef123456zyxwvu");
  });
});
