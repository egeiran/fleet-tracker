import type { IngestEvent } from "@vakt/domain";

export interface SseMessage {
  id: string;
  event: string;
  data: string;
}

export interface SseClient {
  send: (m: SseMessage) => Promise<void> | void;
  /** Called when the hub drops the client (slow reader); should end the response. */
  close: () => void;
}

export const RING = 500;
export const MAX_CLIENTS = 200;
/** Unacknowledged writes a client may accumulate before it is considered dead. */
export const MAX_PENDING = 100;

/**
 * Fan-out of ingest events to SSE clients with a replay ring for `Last-Event-ID`.
 * Ids are prefixed with a per-process boot id so a stale id from a previous run falls through to
 * `resync` instead of being replayed from the wrong point.
 */
export class SseHub {
  private clients = new Map<SseClient, { pending: number }>();
  private ring: SseMessage[] = [];
  private counter = 0;
  readonly bootId = Math.random().toString(36).slice(2, 8);

  get size(): number {
    return this.clients.size;
  }

  get full(): boolean {
    return this.clients.size >= MAX_CLIENTS;
  }

  add(client: SseClient): boolean {
    if (this.full) return false;
    this.clients.set(client, { pending: 0 });
    return true;
  }

  remove(client: SseClient): void {
    this.clients.delete(client);
  }

  /**
   * Messages after `lastId`, `[]` when the client is current, or null when the id is from another
   * boot or fell out of the ring (caller sends `resync`). Sequence-based, so `<boot>:0` works too.
   */
  replayAfter(lastId: string | null): SseMessage[] | null {
    if (!lastId) return [];
    const sep = lastId.indexOf(":");
    if (sep < 0 || lastId.slice(0, sep) !== this.bootId) return null;
    const seq = Number(lastId.slice(sep + 1));
    if (!Number.isInteger(seq) || seq < 0) return null;
    if (seq >= this.counter) return [];
    const firstSeq = this.counter - this.ring.length + 1;
    if (seq < firstSeq - 1) return null;
    return this.ring.slice(seq - (firstSeq - 1));
  }

  sequenceOf(id: string): number {
    return Number(id.slice(id.indexOf(":") + 1));
  }

  broadcast(e: IngestEvent): void {
    const msg: SseMessage = { id: `${this.bootId}:${++this.counter}`, event: e.type, data: JSON.stringify(e) };
    this.ring.push(msg);
    if (this.ring.length > RING) this.ring.splice(0, this.ring.length - RING);
    for (const [c, state] of this.clients) {
      if (state.pending >= MAX_PENDING) {
        this.drop(c);
        continue;
      }
      state.pending++;
      Promise.resolve(c.send(msg))
        .then(() => {
          state.pending--;
        })
        .catch(() => this.drop(c));
    }
  }

  /** Runs from timers and the stream loop; a throwing close() must never take the worker down. */
  private drop(c: SseClient): void {
    this.clients.delete(c);
    try {
      c.close();
    } catch {
      /* socket already gone */
    }
  }

  get lastId(): string {
    return `${this.bootId}:${this.counter}`;
  }
}
