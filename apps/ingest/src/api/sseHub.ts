import type { IngestEvent } from "@vakt/domain";

export interface SseMessage {
  id: string;
  event: string;
  data: string;
}

export interface SseClient {
  send: (m: SseMessage) => Promise<void> | void;
}

const RING = 500;
const MAX_CLIENTS = 200;

/** Fan-out of ingest events to SSE clients with a replay ring for `Last-Event-ID`. */
export class SseHub {
  private clients = new Set<SseClient>();
  private ring: SseMessage[] = [];
  private counter = 0;

  get size(): number {
    return this.clients.size;
  }

  add(client: SseClient): boolean {
    if (this.clients.size >= MAX_CLIENTS) return false;
    this.clients.add(client);
    return true;
  }

  remove(client: SseClient): void {
    this.clients.delete(client);
  }

  /** Returns the messages after `lastId`, or null when the id fell out of the ring. */
  replayAfter(lastId: string | null): SseMessage[] | null {
    if (!lastId) return [];
    const idx = this.ring.findIndex((m) => m.id === lastId);
    if (idx < 0) return null;
    return this.ring.slice(idx + 1);
  }

  broadcast(e: IngestEvent): void {
    const msg: SseMessage = { id: String(++this.counter), event: e.type, data: JSON.stringify(e) };
    this.ring.push(msg);
    if (this.ring.length > RING) this.ring.splice(0, this.ring.length - RING);
    for (const c of this.clients) {
      Promise.resolve(c.send(msg)).catch(() => this.clients.delete(c));
    }
  }

  get lastId(): string {
    return String(this.counter);
  }
}
