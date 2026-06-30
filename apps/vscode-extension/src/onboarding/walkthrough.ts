// First-run Walkthrough trigger (spec FR-29): explains capture, storage,
// and pause/redact before background capture begins. The walkthrough's
// actual content is declarative (package.json contributes.walkthroughs +
// the markdown files in walkthrough/); this just opens it once per
// install, the first time the extension activates.

import * as vscode from "vscode";

const HAS_SEEN_WALKTHROUGH_KEY = "recall.hasSeenWalkthrough";

export async function maybeShowWalkthrough(context: vscode.ExtensionContext): Promise<void> {
  if (context.globalState.get<boolean>(HAS_SEEN_WALKTHROUGH_KEY)) {
    return;
  }
  await context.globalState.update(HAS_SEEN_WALKTHROUGH_KEY, true);
  // context.extension.id resolves the real "publisher.name" VS Code assigns
  // at install time, including its un-scoping of the npm-style package name
  // — safer than hand-building the id from package.json fields.
  await vscode.commands.executeCommand(
    "workbench.action.openWalkthrough",
    `${context.extension.id}#recall.welcome`,
    false
  );
}
