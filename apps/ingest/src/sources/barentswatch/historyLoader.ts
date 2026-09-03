import { aisToPoint, sortTrack, type TrackPoint } from "@vakt/domain";
import { TIMING } from "../../config";
import { errMessage, logger } from "../../log";
import type { BarentsWatchClient } from "./client";

const log = logger("bw.history");

export interface HistoryResult {
  mmsi: number;
  track: TrackPoint[];
}

/** Sequential 24 h history fetches with spacing, Retry-After handling and a three-strike give-up. */
export class HistoryLoader {
  private queue: number[] = [];
  private attempts = new Map<number, number>();
  private inFlight: number | null = null;
  private running = false;
  private stopped = false;

  constructor(
    private client: BarentsWatchClient,
    private onLoaded: (r: HistoryResult) => void,
    private onGaveUp?: (mmsi: number) => void,
    private spacingMs: number = TIMING.historySpacingMs,
  ) {}

  enqueue(mmsi: number): void {
    if (this.queue.includes(mmsi) || this.inFlight === mmsi) return;
    this.queue.push(mmsi);
    void this.run();
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
        this.inFlight = mmsi;
        const n = (this.attempts.get(mmsi) ?? 0) + 1;
        this.attempts.set(mmsi, n);
        try {
          const res = await this.client.tracksLast24h(mmsi);
          if (res.status === 429 || res.status >= 500) {
            const wait = res.retryAfterMs ?? 30_000;
            log.warn("history throttled", { mmsi, status: res.status, waitMs: wait });
            if (n < 3) this.queue.push(mmsi);
            else this.giveUp(mmsi);
            await sleep(wait);
            continue;
          }
          const points: TrackPoint[] = [];
          for (const m of res.data) {
            const p = aisToPoint(m);
            if (p) points.push(p);
          }
          this.onLoaded({ mmsi, track: sortTrack(points) });
          this.attempts.delete(mmsi);
        } catch (e) {
          log.warn("history fetch failed", { mmsi, error: errMessage(e), attempt: n });
          if (n < 3) this.queue.push(mmsi);
          else this.giveUp(mmsi);
        } finally {
          this.inFlight = null;
        }
        await sleep(this.spacingMs);
      }
    } finally {
      this.running = false;
    }
  }

  /** Forget the strike count so a later re-assignment gets a fresh set of attempts. */
  private giveUp(mmsi: number): void {
    this.attempts.delete(mmsi);
    this.onGaveUp?.(mmsi);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
