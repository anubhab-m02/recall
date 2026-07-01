// Drains the durable IndexedDB queue (spec NFR-REL-2) against the Local
// Agent, called on service-worker wake (install/startup) and on a
// recurring alarm (alarms — unlike setInterval/setTimeout — wake a
// terminated MV3 service worker, so this is the only reliable retry path).

import { listQueuedEvents, removeQueuedEvent } from "./eventQueue.js";

export interface FlushableAgentClient {
  postEvent: (input: import("@recall/shared-types").MemoryEventInput) => Promise<unknown>;
}

export interface FlushResult {
  flushed: number;
  remaining: number;
}

export async function flushQueue(client: FlushableAgentClient): Promise<FlushResult> {
  const queued = await listQueuedEvents();
  let flushed = 0;

  for (const item of queued) {
    try {
      await client.postEvent(item.input);
      await removeQueuedEvent(item.queueId);
      flushed++;
    } catch {
      // Agent unreachable or rejected the event — stop here rather than
      // hammering a down agent, and preserve queue order for the next
      // flush attempt (an alarm fires again shortly).
      break;
    }
  }

  const remaining = (await listQueuedEvents()).length;
  return { flushed, remaining };
}
