import { describe, expect, it } from "vitest";
import { redactMemoryEvent, testRedaction } from "../src/redaction/pipeline.js";

describe("redactMemoryEvent", () => {
  it("redacts secrets nested anywhere in the payload", () => {
    const event = {
      payload: {
        command: "export AWS_KEY=AKIAIOSFODNN7EXAMPLE && deploy.sh",
        env: { GITHUB_TOKEN: "ghp_1234567890abcdefghijklmnopqrstuvwxyz12" },
        args: ["--token", "xoxb-test-fixture-not-a-real-token-000000"]
      },
      embeddingText: "terminal_command | exit=0 | export AWS_KEY=AKIAIOSFODNN7EXAMPLE"
    };

    const { event: redacted, redacted: wasRedacted } = redactMemoryEvent(event);

    expect(wasRedacted).toBe(true);
    expect(JSON.stringify(redacted.payload)).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(JSON.stringify(redacted.payload)).not.toContain(
      "ghp_1234567890abcdefghijklmnopqrstuvwxyz12"
    );
    expect(JSON.stringify(redacted.payload)).not.toContain(
      "xoxb-test-fixture-not-a-real-token-000000"
    );
    expect(redacted.embeddingText).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("leaves an event with no secrets untouched", () => {
    const event = {
      payload: { command: "npm test", exitCode: 0 },
      embeddingText: "terminal_command | exit=0 | npm test"
    };
    const { event: redacted, redacted: wasRedacted } = redactMemoryEvent(event);
    expect(wasRedacted).toBe(false);
    expect(redacted.payload).toEqual(event.payload);
    expect(redacted.embeddingText).toBe(event.embeddingText);
  });
});

describe("testRedaction", () => {
  it("reports findings without requiring persistence", () => {
    const result = testRedaction("DATABASE_SECRET=abcdef123456zyxwvu");
    expect(result.redacted).toContain("[REDACTED:");
    expect(result.findings.length).toBeGreaterThan(0);
  });
});
