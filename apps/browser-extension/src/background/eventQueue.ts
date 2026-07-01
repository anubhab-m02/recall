// Durable capture queue (spec NFR-REL-2): MV3 service workers are
// terminated aggressively, so buffered events MUST be persisted to
// IndexedDB — never held only in memory — and flushed/retried on the next
// worker wake (see flushQueue.ts). IndexedDB (unlike an in-memory array)
// survives the service worker being killed between page visits.

import type { MemoryEventInput } from "@recall/shared-types";

const DB_NAME = "recall-capture-queue";
const DB_VERSION = 1;
const STORE_NAME = "pending-events";

export interface QueuedEvent {
  queueId: number;
  input: MemoryEventInput;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "queueId", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error as unknown as Error);
  });
}

export async function enqueueEvent(input: MemoryEventInput): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).add({ input });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error as unknown as Error);
    });
  } finally {
    db.close();
  }
}

export async function listQueuedEvents(): Promise<QueuedEvent[]> {
  const db = await openDb();
  try {
    return await new Promise<QueuedEvent[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result as QueuedEvent[]);
      req.onerror = () => reject(req.error as unknown as Error);
    });
  } finally {
    db.close();
  }
}

export async function removeQueuedEvent(queueId: number): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(queueId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error as unknown as Error);
    });
  } finally {
    db.close();
  }
}
