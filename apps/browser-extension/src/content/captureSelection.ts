// Content script backing the "Save selection to Recall" context menu
// (spec FR-8): the background service worker owns the context menu item
// itself (content scripts can't register one), and messages this script
// to read the current window selection when the user clicks it. Only the
// selected text is read — never the page's full DOM/content — and that
// text still passes through the Local Agent's redaction pipeline (FR-11)
// once posted, same as every other capture surface.

chrome.runtime.onMessage.addListener((message: { type?: string }, _sender, sendResponse) => {
  if (message.type !== "recall.getSelection") return undefined;
  sendResponse({ selection: window.getSelection()?.toString() ?? "" });
  return true;
});
