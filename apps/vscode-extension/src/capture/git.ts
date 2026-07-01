// Git activity capture via the built-in Git extension API (spec FR-4):
// commits and branch switches, detected from HEAD state changes on each
// open repository. Respects global pause and the per-project denylist
// (FR-26).
//
// vscode.git ships no @types package (its API is deliberately minimal and
// versioned via getAPI(1)), so the shapes used here are narrowed locally
// to just the fields Recall reads.

import * as vscode from "vscode";
import type { AgentClient, SettingsCache } from "../agentClient.js";
import { buildBranchSwitchEmbeddingText, buildGitCommitEmbeddingText } from "./gitUtils.js";

interface GitBranch {
  name?: string;
  commit?: string;
}

interface GitRepositoryState {
  HEAD: GitBranch | undefined;
  onDidChange: vscode.Event<void>;
}

interface GitCommitLogEntry {
  hash: string;
  message: string;
}

interface GitChange {
  uri: vscode.Uri;
}

interface GitRepository {
  rootUri: vscode.Uri;
  state: GitRepositoryState;
  log(options?: { maxEntries?: number }): Promise<GitCommitLogEntry[]>;
  diffBetween(ref1: string, ref2: string): Promise<GitChange[]>;
}

interface GitApi {
  repositories: GitRepository[];
  onDidOpenRepository: vscode.Event<GitRepository>;
}

interface GitExtensionExports {
  getAPI(version: 1): GitApi;
}

interface KnownHead {
  branch?: string;
  commit?: string;
}

export function registerGitCapture(
  context: vscode.ExtensionContext,
  client: AgentClient,
  settings: SettingsCache,
  deviceId: string
): void {
  const gitExtension = vscode.extensions.getExtension<GitExtensionExports>("vscode.git");
  if (!gitExtension) return; // Git extension can be disabled; capture degrades gracefully.

  void wireUpGitApi(gitExtension, context, client, settings, deviceId);
}

async function wireUpGitApi(
  gitExtension: vscode.Extension<GitExtensionExports>,
  context: vscode.ExtensionContext,
  client: AgentClient,
  settings: SettingsCache,
  deviceId: string
): Promise<void> {
  const exports = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();
  const api = exports.getAPI(1);
  const known = new Map<string, KnownHead>();

  const watch = (repo: GitRepository): void => {
    const repoRoot = repo.rootUri.fsPath;
    known.set(repoRoot, { branch: repo.state.HEAD?.name, commit: repo.state.HEAD?.commit });
    context.subscriptions.push(
      repo.state.onDidChange(
        () => void handleChange(repo, repoRoot, known, client, settings, deviceId)
      )
    );
  };

  api.repositories.forEach(watch);
  context.subscriptions.push(api.onDidOpenRepository(watch));
}

async function handleChange(
  repo: GitRepository,
  repoRoot: string,
  known: Map<string, KnownHead>,
  client: AgentClient,
  settings: SettingsCache,
  deviceId: string
): Promise<void> {
  const previous = known.get(repoRoot);
  const currentBranch = repo.state.HEAD?.name;
  const currentCommit = repo.state.HEAD?.commit;
  known.set(repoRoot, { branch: currentBranch, commit: currentCommit });

  if (settings.get().capturePaused) return;
  if (settings.get().projectDenylist.includes(repoRoot)) return;

  if (previous?.branch && currentBranch && previous.branch !== currentBranch) {
    try {
      await client.postEvent({
        tenantId: "local",
        deviceId,
        source: "vscode",
        type: "branch_switch",
        occurredAt: new Date().toISOString(),
        project: { repoRoot, branch: currentBranch },
        payload: { fromBranch: previous.branch, toBranch: currentBranch },
        embeddingText: buildBranchSwitchEmbeddingText(previous.branch, currentBranch)
      });
    } catch (err) {
      console.error("Recall: failed to capture branch switch", err);
    }
  }

  if (previous?.commit && currentCommit && previous.commit !== currentCommit) {
    try {
      const [commit] = await repo.log({ maxEntries: 1 });
      const message = commit?.message ?? "";
      let filesChanged: string[] = [];
      try {
        const changes = await repo.diffBetween(previous.commit, currentCommit);
        filesChanged = changes.map((c) => vscode.workspace.asRelativePath(c.uri, false));
      } catch {
        // diffBetween can fail across some ref states (e.g. rebase/reset) —
        // the commit itself is still worth capturing without a file list.
      }

      await client.postEvent({
        tenantId: "local",
        deviceId,
        source: "vscode",
        type: "git_commit",
        occurredAt: new Date().toISOString(),
        project: { repoRoot, branch: currentBranch },
        payload: {
          sha: currentCommit,
          message,
          filesChanged,
          diffStat: `${filesChanged.length} file(s) changed`
        },
        embeddingText: buildGitCommitEmbeddingText(message)
      });
    } catch (err) {
      console.error("Recall: failed to capture git commit", err);
    }
  }
}
