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
  lastLineAt: number | null;
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
  private stopped = false;
  private failures = 0;
  private stableSince = 0;
  private lineTimes: number[] = [];
  private loopPromise: Promise<void> | null = null;

  constructor(
    private client: BarentsWatchClient,
    private opts: StreamRunnerOptions,
  ) {
    this.stats = { connected: false, reconnects: 0, linesPerMin: 0, lastLineAt: null, since: opts.initialSince, lastError: null };
  }

  start(): void {
    if (this.loopPromise) return;
    this.stopped = false;
    this.loopPromise = this.loop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.abort?.abort();
    await this.loopPromise?.catch(() => undefined);
    this.loopPromise = null;
  }

  /** Lines received in the last minute (computed on demand for /api/health). */
  rate(): number {
    const cutoff = Date.now() - 60_000;
    this.lineTimes = this.lineTimes.filter((t) => t >= cutoff);
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
      let watchdog: ReturnType<typeof setTimeout> | null = null;
      const armWatchdog = () => {
        if (watchdog) clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          log.warn("stream silent, reconnecting");
          ac.abort();
        }, this.opts.watchdogMs ?? TIMING.streamWatchdogMs);
      };
      let sinceFlushed = Date.now();
      try {
        const res = await this.client.openStream({ bbox: this.opts.bbox }, this.stats.since, ac.signal);
        this.stats.connected = true;
        this.stats.lastError = null;
        this.stableSince = Date.now();
        this.emitState();
        log.info("stream connected", { since: this.stats.since });
        armWatchdog();
        for await (const raw of ndjson(res.body!, (line) => log.debug("bad line", { line: line.slice(0, 80) }))) {
          if (!isAisMessage(raw)) continue;
          armWatchdog();
          const now = Date.now();
          this.lineTimes.push(now);
          this.stats.lastLineAt = now;
          if (!inBbox([raw.longitude, raw.latitude], this.opts.bbox)) continue;
          if (raw.msgtime > (this.stats.since ?? "")) this.stats.since = raw.msgtime;
          if (now - sinceFlushed > TIMING.streamSinceFlushMs && this.stats.since) {
            sinceFlushed = now;
            this.opts.onSince?.(this.stats.since);
          }
          this.opts.onMessage(raw);
          if (this.lineTimes.length > 5000) this.lineTimes.splice(0, this.lineTimes.length - 5000);
          if (now - this.stableSince > 5 * 60_000) this.failures = 0;
        }
        log.info("stream ended by server");
      } catch (e) {
        if (!this.stopped) {
          this.stats.lastError = errMessage(e);
          log.warn("stream error", { error: this.stats.lastError });
        }
      } finally {
        if (watchdog) clearTimeout(watchdog);
        this.stats.connected = false;
        this.emitState();
      }
      if (this.stopped) break;
      this.failures++;
      this.stats.reconnects++;
      const min = this.opts.minBackoffMs ?? 1000;
      const max = this.opts.maxBackoffMs ?? 60_000;
      const base = Math.min(max, min * 2 ** Math.min(this.failures - 1, 6));
      const delay = Math.random() * base;
      log.info("stream reconnect scheduled", { inMs: Math.round(delay), failures: this.failures });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
