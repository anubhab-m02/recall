// Greedy time-window clustering (spec FR-15: "same error signature, same
// files, same time window, same search-then-fix pattern"). This
// implements the time-window + same-project signal; full error-signature/
// file-overlap clustering is a reasonable future refinement once there's
// real usage data to tune it against, not required for a first usable
// grouping. Events are sorted chronologically and a new event joins the
// current cluster only if it's within `windowMs` of the cluster's last
// event AND in the same project — otherwise it starts a new cluster.

import type { MemoryEvent } from "@recall/shared-types";

export function clusterEventsByTimeWindow(
  events: readonly MemoryEvent[],
  windowMs: number
): MemoryEvent[][] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
  );

  const clusters: MemoryEvent[][] = [];
  for (const event of sorted) {
    const current = clusters.at(-1);
    const last = current?.at(-1);
    const withinWindow =
      last !== undefined &&
      new Date(event.occurredAt).getTime() - new Date(last.occurredAt).getTime() <= windowMs;
    const sameProject = last !== undefined && event.project?.repoRoot === last.project?.repoRoot;

    if (current && withinWindow && sameProject) {
      current.push(event);
    } else {
      clusters.push([event]);
    }
  }
  return clusters;
}
