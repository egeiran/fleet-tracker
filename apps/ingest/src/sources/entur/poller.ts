import type { Bbox, EnturVehicle } from "@vakt/domain";
import { TIMING } from "../../config";
import { errMessage, logger } from "../../log";
import type { EnturClient } from "./client";

const log = logger("entur");

export interface PollerStats {
  ok: boolean;
  lastSuccessAt: number | null;
  lastError: string | null;
  vehicles: number;
  polls: number;
  consecutiveFailures: number;
}

export class EnturPoller {
  readonly stats: PollerStats = { ok: false, lastSuccessAt: null, lastError: null, vehicles: 0, polls: 0, consecutiveFailures: 0 };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private client: EnturClient,
    private bbox: Bbox,
    private onVehicles: (v: EnturVehicle[]) => void,
    private onStateChange?: (s: PollerStats) => void,
    private intervalMs: number = TIMING.enturPollMs,
  ) {}

  start(): void {
    this.stopped = false;
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  async tick(): Promise<void> {
    if (this.stopped) return;
    this.stats.polls++;
    try {
      const vehicles = await this.client.railVehicles(this.bbox);
      this.stats.ok = true;
      this.stats.lastError = null;
      this.stats.consecutiveFailures = 0;
      this.stats.lastSuccessAt = Date.now();
      this.stats.vehicles = vehicles.length;
      try {
        this.onVehicles(vehicles);
      } catch (cbError) {
        // A consumer bug must not masquerade as an Entur outage.
        log.error("vehicle callback failed", { error: errMessage(cbError) });
      }
    } catch (e) {
      this.stats.ok = false;
      this.stats.consecutiveFailures++;
      this.stats.lastError = errMessage(e);
      log.warn("poll failed", { error: this.stats.lastError, consecutive: this.stats.consecutiveFailures });
      try {
        this.onStateChange?.(this.stats);
      } catch (cbError) {
        log.error("state callback failed", { error: errMessage(cbError) });
      }
    } finally {
      // Always reschedule, even if a callback threw.
      if (!this.stopped) this.timer = setTimeout(() => void this.tick(), this.intervalMs);
    }
  }
}
