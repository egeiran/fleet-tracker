import { setTimeout as sleep } from "node:timers/promises";
import { inBbox, isAisMessage, type AisMessage, type Bbox } from "@vakt/domain";
import { TIMING } from "../../config";
import { errMessage, logger } from "../../log";
import type { BarentsWatchClient } from "./client";
import { ndjson } from "./ndjson";

const log = logger("bw.stream");

export interface StreamStats {
  connected: boolean;
  reconnects: number;
  linesPerMin: number;
  since: string | null;
  lastError: string | null;
}

export interface StreamRunnerOptions {
  bbox: Bbox;
  initialSince: string | null;
  onMessage: (m: AisMessage) => void;
  onSince?: (since: string) => void;
  onStateChange?: (s: StreamStats) => void;
  watchdogMs?: number;
  minBackoffMs?: number;
  maxBackoffMs?: number;
}

/**
 * Keeps the BarentsWatch stream alive: reconnects with jittered backoff, restarts when it goes
 * quiet (there is no server heartbeat) and remembers `since` so a restart backfills the gap.
 */
export class StreamRunner {
  readonly stats: StreamStats;
  private abort: AbortController | null = null;
  private stopAbort = new AbortController();
  private stopped = false;
  private failures = 0;
  private lineTimes: number[] = [];
  private lastLineAt = 0;
  private loopPromise: Promise<void> | null = null;

  constructor(
    private client: BarentsWatchClient,
    private opts: StreamRunnerOptions,
  ) {
    this.stats = { connected: false, reconnects: 0, linesPerMin: 0, since: opts.initialSince, lastError: null };
  }

  start(): void {
    if (this.loopPromise) return;
    this.stopped = false;
    this.stopAbort = new AbortController();
    this.loopPromise = this.loop();
  }

  /** Aborts the live request and any backoff sleep so shutdown never waits on a timer. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.stopAbort.abort();
    this.abort?.abort();
    await this.loopPromise?.catch(() => undefined);
    this.loopPromise = null;
  }

  /** Lines received in the last minute (computed on demand for /api/health). */
  rate(): number {
    const cutoff = Date.now() - 60_000;
    let i = 0;
    while (i < this.lineTimes.length && this.lineTimes[i]! < cutoff) i++;
    if (i) this.lineTimes.splice(0, i);
    this.stats.linesPerMin = this.lineTimes.length;
    return this.stats.linesPerMin;
  }

  private emitState(): void {
    this.rate();
    this.opts.onStateChange?.(this.stats);
  }

  private async loop(): Promise<void> {
    while (!this.stopped) {
      const ac = new AbortController();
      this.abort = ac;
      const watchdogMs = this.opts.watchdogMs ?? TIMING.streamWatchdogMs;
      // One periodic check instead of re-arming a timer per line (thousands per minute).
      const watchdog = setInterval(() => {
        if (Date.now() - this.lastLineAt > watchdogMs) {
          log.warn("stream silent, reconnecting");
          ac.abort();
        }
      }, Math.max(1000, Math.floor(watchdogMs / 3)));
      let sinceFlushed = Date.now();
      let sinceMs = this.stats.since ? Date.parse(this.stats.since) : 0;
      const connectedAt = Date.now();
      try {
        const res = await this.client.openStream({ bbox: this.opts.bbox }, this.stats.since, ac.signal);
        this.stats.connected = true;
        this.stats.lastError = null;
        this.lastLineAt = Date.now();
        this.emitState();
        log.info("stream connected", { since: this.stats.since });
        for await (const raw of ndjson(res.body!, (line) => log.debug("bad line", { line: line.slice(0, 80) }))) {
          if (!isAisMessage(raw)) continue;
          const now = Date.now();
          this.lastLineAt = now;
          this.lineTimes.push(now);
          if (this.lineTimes.length > 20_000) this.rate();
          if (!inBbox([raw.longitude, raw.latitude], this.opts.bbox)) continue;
          // Advance the resume cursor by parsed time; the raw strings vary in offset format.
          const t = Date.parse(raw.msgtime);
          if (Number.isFinite(t) && t > sinceMs) {
            sinceMs = t;
            this.stats.since = raw.msgtime;
          }
          if (now - sinceFlushed > TIMING.streamSinceFlushMs && this.stats.since) {
            sinceFlushed = now;
            this.opts.onSince?.(this.stats.since);
          }
          this.opts.onMessage(raw);
        }
        log.info("stream ended by server");
      } catch (e) {
        if (!this.stopped) {
          this.stats.lastError = errMessage(e);
          log.warn("stream error", { error: this.stats.lastError });
        }
      } finally {
        clearInterval(watchdog);
        this.stats.connected = false;
        this.emitState();
      }
      if (this.stopped) break;
      // A connection that held for five minutes resets the backoff ladder.
      if (Date.now() - connectedAt > 5 * 60_000) this.failures = 0;
      this.failures++;
      this.stats.reconnects++;
      const min = this.opts.minBackoffMs ?? 1000;
      const max = this.opts.maxBackoffMs ?? 60_000;
      const base = Math.min(max, min * 2 ** Math.min(this.failures - 1, 6));
      const delay = Math.random() * base;
      log.info("stream reconnect scheduled", { inMs: Math.round(delay), failures: this.failures });
      try {
        await sleep(delay, undefined, { signal: this.stopAbort.signal });
      } catch {
        break;
      }
    }
  }
}
