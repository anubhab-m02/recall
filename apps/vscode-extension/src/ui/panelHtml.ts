// Pure HTML-building helpers shared by the generation-result webviews
// (Ask Recall, daily standup, weekly summary — spec §13 Phase 6: "surface
// in a VS Code panel with a 'Copy' action"). Kept free of `vscode` so
// escaping logic is unit-testable — webview content is untrusted-ish
// (ultimately derived from the user's own captured data, but rendered as
// raw HTML) and must be escaped before interpolation.

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildGenerationPanelHtml(title: string, draftText: string): string {
  // </script> inside draftText would otherwise close the script block
  // early when embedded via JSON.stringify below.
  const safeDraftJson = JSON.stringify(draftText).replace(/<\/script/gi, "<\\/script");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body>
  <h2>${escapeHtml(title)}</h2>
  <pre id="draft" style="white-space: pre-wrap; font-family: var(--vscode-editor-font-family);">${escapeHtml(draftText)}</pre>
  <button id="copyButton">Copy</button>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById("copyButton").addEventListener("click", () => {
      vscode.postMessage({ type: "copy", text: ${safeDraftJson} });
    });
  </script>
</body>
</html>`;
}
