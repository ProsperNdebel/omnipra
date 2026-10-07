/**
 * Durable outbox for audio chunks, backed by IndexedDB.
 * A chunk is written here before any upload attempt and deleted only after the server
 * confirms it, so a dead connection, a closed tab, or a reload loses nothing.
 */

export interface QueuedChunk {
  manifestationId: string;
  runId: string;
  seq: number;
  offsetSec: number;
  durationSec: number;
  mimeType: string;
  blob: Blob;
  queuedAt: number;
}

const DB_NAME = "presence-capture";
const STORE = "chunks";
const VERSION = 1;

export class ChunkQueue {
  private db: Promise<IDBDatabase>;

  constructor() {
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: ["manifestationId", "runId", "seq"] });
        store.createIndex("queuedAt", "queuedAt");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async put(chunk: QueuedChunk): Promise<void> {
    await this.tx("readwrite", (s) => s.put(chunk));
  }

  /** Oldest chunk across all manifestations, or null when the queue is empty. */
  async oldest(): Promise<QueuedChunk | null> {
    return this.tx("readonly", (s) =>
      new Promise<QueuedChunk | null>((resolve, reject) => {
        const req = s.index("queuedAt").openCursor();
        req.onsuccess = () => resolve((req.result?.value as QueuedChunk) ?? null);
        req.onerror = () => reject(req.error);
      }),
    );
  }

  async remove(c: Pick<QueuedChunk, "manifestationId" | "runId" | "seq">): Promise<void> {
    await this.tx("readwrite", (s) => s.delete([c.manifestationId, c.runId, c.seq]));
  }

  async count(): Promise<number> {
    return this.tx("readonly", (s) => s.count());
  }

  private async tx<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
  ): Promise<T> {
    const db = await this.db;
    const tx = db.transaction(STORE, mode);
    const result = fn(tx.objectStore(STORE));
    if (result instanceof Promise) return result;
    return new Promise<T>((resolve, reject) => {
      tx.oncomplete = () => resolve(result.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
}
