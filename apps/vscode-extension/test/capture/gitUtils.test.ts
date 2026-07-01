import { describe, expect, it } from "vitest";
import {
  buildBranchSwitchEmbeddingText,
  buildGitCommitEmbeddingText
} from "../../src/capture/gitUtils.js";

describe("buildGitCommitEmbeddingText", () => {
  it("includes the commit message", () => {
    expect(buildGitCommitEmbeddingText("fix flaky test")).toBe("git_commit | fix flaky test");
  });
});

describe("buildBranchSwitchEmbeddingText", () => {
  it("includes both branch names when the previous branch is known", () => {
    expect(buildBranchSwitchEmbeddingText("main", "feature/oauth")).toBe(
      "branch_switch | main -> feature/oauth"
    );
  });

  it("falls back to just the new branch when the previous one is unknown", () => {
    expect(buildBranchSwitchEmbeddingText(undefined, "feature/oauth")).toBe(
      "branch_switch | feature/oauth"
    );
  });
});
