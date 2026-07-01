// Tracks a page visit's start/end so a page_visit MemoryEvent (spec §7.1)
// can carry a real dwellMs, computed when the tab navigates away or
// closes rather than at load time. Kept free of `chrome` so it's
// unit-testable — serviceWorker.ts supplies real tab ids/timestamps.

export interface PageVisitRecord {
  canonicalUrl: string;
  title: string;
  dwellMs: number;
}

export class VisitTracker {
  private readonly current = new Map<number, { url: string; title: string; startedAt: number }>();

  start(tabId: number, url: string, title: string, now: number): void {
    this.current.set(tabId, { url, title, startedAt: now });
  }

  // Ends tracking for a tab (navigated away, or the tab closed) and
  // returns the completed visit, or undefined if nothing was tracked.
  end(tabId: number, now: number): PageVisitRecord | undefined {
    const tracked = this.current.get(tabId);
    if (!tracked) return undefined;
    this.current.delete(tabId);
    return { canonicalUrl: tracked.url, title: tracked.title, dwellMs: now - tracked.startedAt };
  }
}
