// Pure status-bar text formatting (spec FR-25), kept free of `vscode` so
// it's unit-testable.

export interface StatusBarState {
  text: string;
  tooltip: string;
}

export function formatStatusBarState(paused: boolean): StatusBarState {
  return paused
    ? {
        text: "$(circle-slash) Recall: Paused",
        tooltip: "Recall capture is paused. Click to resume."
      }
    : {
        text: "$(record) Recall: Active",
        tooltip: "Recall is capturing. Click to pause."
      };
}
