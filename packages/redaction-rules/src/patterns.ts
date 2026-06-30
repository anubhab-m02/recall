import type { Finding, Rule } from "./types.js";

function regexRule(name: string, pattern: RegExp): Rule {
  return {
    name,
    detect(text: string): Finding[] {
      const findings: Finding[] = [];
      for (const m of text.matchAll(pattern)) {
        if (m.index === undefined) continue;
        findings.push({ rule: name, index: m.index, length: m[0].length, match: m[0] });
      }
      return findings;
    }
  };
}

// JWT: header.payload.signature, each segment base64url (spec FR-11).
export const jwtRule = regexRule(
  "jwt",
  /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g
);

// AWS access key id.
export const awsAccessKeyRule = regexRule("aws-access-key", /\bAKIA[0-9A-Z]{16}\b/g);

// GitHub personal access / OAuth / app tokens.
export const githubTokenRule = regexRule("github-token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g);

// Slack tokens (bot/user/app/legacy).
export const slackTokenRule = regexRule("slack-token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g);

// Stripe live/test secret + publishable keys.
export const stripeKeyRule = regexRule("stripe-key", /\b[sp]k_(live|test)_[A-Za-z0-9]{16,}\b/g);

// Google API key (always starts AIza, 39 chars total in practice).
export const googleApiKeyRule = regexRule("google-api-key", /\bAIza[0-9A-Za-z_-]{35,}\b/g);

// PEM private key blocks.
export const privateKeyBlockRule = regexRule(
  "private-key-block",
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |)PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |DSA |OPENSSH |)PRIVATE KEY-----/g
);

// Credentials embedded in a URL: scheme://user:password@host.
export const urlCredentialsRule = regexRule(
  "url-credentials",
  /\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s:@/]+:[^\s:@/]+@[^\s]+/g
);

// .env-style KEY=VALUE lines where the key name signals a secret.
export const dotenvSecretRule = regexRule(
  "dotenv-secret",
  /^[A-Z][A-Z0-9_]*(?:SECRET|TOKEN|KEY|PASSWORD|PWD|CREDENTIAL|PRIVATE)[A-Z0-9_]*\s*=\s*\S+$/gm
);

// Generic `key: value` / `key = value` assignment to a secret-shaped name,
// covering formats not caught by a vendor-specific pattern above.
export const genericSecretAssignmentRule = regexRule(
  "generic-secret-assignment",
  /\b(api[_-]?key|apikey|secret|access[_-]?token|auth[_-]?token|password|passwd|client[_-]?secret)\s*[:=]\s*['"]?[A-Za-z0-9\-_./+=]{8,}['"]?/gi
);

export const ALL_PATTERN_RULES: Rule[] = [
  jwtRule,
  awsAccessKeyRule,
  githubTokenRule,
  slackTokenRule,
  stripeKeyRule,
  googleApiKeyRule,
  privateKeyBlockRule,
  urlCredentialsRule,
  dotenvSecretRule,
  genericSecretAssignmentRule
];
