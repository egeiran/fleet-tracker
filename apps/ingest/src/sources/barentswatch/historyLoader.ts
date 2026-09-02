import { aisToPoint, sortTrack, type AisMessage, type TrackPoint } from "@vakt/domain";
import { TIMING } from "../../config";
import { errMessage, logger } from "../../log";
import type { BarentsWatchClient } from "./client";

const log = logger("bw.history");

export interface HistoryResult {
  mmsi: number;
  track: TrackPoint[];
  messages: AisMessage[];
}

/** Sequential 24 h history fetches with spacing, Retry-After handling and a three-strike give-up. */
export class HistoryLoader {
  private queue: number[] = [];
  private attempts = new Map<number, number>();
  private running = false;
  private stopped = false;

  constructor(
    private client: BarentsWatchClient,
    private onLoaded: (r: HistoryResult) => void,
    private onGaveUp?: (mmsi: number) => void,
    private spacingMs: number = TIMING.historySpacingMs,
  ) {}

  enqueue(mmsi: number): void {
    if (this.queue.includes(mmsi)) return;
    this.queue.push(mmsi);
    void this.run();
  }

  get pending(): number {
    return this.queue.length;
  }

  stop(): void {
    this.stopped = true;
    this.queue = [];
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length && !this.stopped) {
        const mmsi = this.queue.shift()!;
        const n = (this.attempts.get(mmsi) ?? 0) + 1;
        this.attempts.set(mmsi, n);
        try {
          const res = await this.client.tracksLast24h(mmsi);
          if (res.status === 429 || res.status >= 500) {
            const wait = res.retryAfterMs ?? 30_000;
            log.warn("history throttled", { mmsi, status: res.status, waitMs: wait });
            if (n < 3) this.queue.push(mmsi);
            else this.onGaveUp?.(mmsi);
            await sleep(wait);
            continue;
          }
          const points: TrackPoint[] = [];
          for (const m of res.data) {
            const p = aisToPoint(m);
            if (p) points.push(p);
          }
          this.onLoaded({ mmsi, track: sortTrack(points), messages: res.data });
          this.attempts.delete(mmsi);
        } catch (e) {
          log.warn("history fetch failed", { mmsi, error: errMessage(e), attempt: n });
          if (n < 3) this.queue.push(mmsi);
          else this.onGaveUp?.(mmsi);
        }
        await sleep(this.spacingMs);
      }
    } finally {
      this.running = false;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
