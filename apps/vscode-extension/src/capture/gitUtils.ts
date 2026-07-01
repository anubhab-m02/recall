// Pure helpers backing git-activity capture (spec FR-4). Kept free of
// `vscode` so they're unit-testable.

export function buildGitCommitEmbeddingText(message: string): string {
  return `git_commit | ${message}`;
}

export function buildBranchSwitchEmbeddingText(
  fromBranch: string | undefined,
  toBranch: string
): string {
  return fromBranch
    ? `branch_switch | ${fromBranch} -> ${toBranch}`
    : `branch_switch | ${toBranch}`;
}
