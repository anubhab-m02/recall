// Pure formatting/decision helpers for the popup UI (spec §13 Phase 5:
// "capture status, pause/resume, per-domain toggles"). Kept free of
// `chrome`/DOM globals so it's unit-testable — Popup.ts is the thin glue
// that calls these and renders the result.

export function formatPauseButtonLabel(paused: boolean): string {
  return paused ? "Resume Capture" : "Pause Capture";
}

export function formatCaptureStatus(paired: boolean, paused: boolean): string {
  if (!paired) return "Not connected to Local Agent";
  return paused ? "Capture paused" : "Capture active";
}

export function formatDomainToggleLabel(hostname: string | undefined, allowed: boolean): string {
  if (!hostname) return "No active tab";
  return allowed ? `Capturing on ${hostname}` : `Not capturing on ${hostname}`;
}

export function formatDomainToggleButtonLabel(allowed: boolean): string {
  return allowed ? "Disable for this domain" : "Enable for this domain";
}

// Toggling FR-26's per-domain opt-out: adds/removes the hostname from the
// denylist without disturbing any other entries.
export function toggleDomainDenylist(
  denylist: readonly string[],
  hostname: string,
  currentlyAllowed: boolean
): string[] {
  if (currentlyAllowed) {
    return [...denylist, hostname];
  }
  return denylist.filter((d) => d !== hostname);
}
