// Debounced background embedding queue (spec §11.1): embedding generation
// must never block the request path (POST /v1/events targets <50ms,
// spec §5A.1) and runs at capped concurrency (default 1 worker, spec
// §5A.2). Events are persisted without an embedding first; this queue
// populates embedding/embeddingModel/embeddingDim asynchronously after.

import type { EmbeddingProvider } from "./provider.js";
import type { LanceDbStore } from "../storage/lancedb.js";

export class EmbeddingQueue {
  private readonly pending: string[] = [];
  private draining = false;
  private stopped = false;
  private currentDrain: Promise<void> | undefined;

  constructor(
    private readonly provider: EmbeddingProvider,
    private readonly lancedb: LanceDbStore
  ) {}

  enqueue(eventId: string): void {
    if (this.stopped) return;
    this.pending.push(eventId);
    if (!this.draining) {
      this.currentDrain = this.drain();
    }
  }

  get size(): number {
    return this.pending.length;
  }

  // Stops picking up further items and waits for whatever embed() call is
  // already in flight to finish, so callers (stopAgent, tests) never close
  // the underlying store out from under a write in progress. Any remaining
  // backlog is left queued in memory and picked back up by the next
  // startAgent()'s unembedded-events recovery scan — not drained here,
  // since waiting out a large backlog would make shutdown unbounded.
  async stop(): Promise<void> {
    this.stopped = true;
    await this.currentDrain;
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      let eventId: string | undefined;
      while (!this.stopped && (eventId = this.pending.shift()) !== undefined) {
        await this.embedOne(eventId);
      }
    } finally {
      this.draining = false;
    }
  }

  private async embedOne(eventId: string): Promise<void> {
    try {
      const event = await this.lancedb.getEventById(eventId);
      if (!event) return; // deleted before its turn in the queue
      const embedding = await this.provider.embed(event.embeddingText);
      await this.lancedb.updateEvent({
        ...event,
        embedding,
        embeddingModel: this.provider.modelName,
        embeddingDim: this.provider.dimension
      });
    } catch (err) {
      // A failed embed leaves the event searchable by keyword/recency only
      // (spec §6.1 graceful degradation) rather than blocking ingestion or
      // crashing the agent.
      console.error(`Recall: failed to embed event ${eventId}`, err);
    }
  }
}
