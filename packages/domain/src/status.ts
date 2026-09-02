import { isStationaryNavStatus } from "./navStatus";
import type { Status } from "./types";

export const STALE_AFTER_MS = 10 * 60_000;

export function isStale(lastSeen: number, now: number, staleAfterMs = STALE_AFTER_MS): boolean {
  return now - lastSeen > staleAfterMs;
}

export interface VesselStatusInput {
  sog: number | null | undefined;
  navStatus: number | null | undefined;
  displacement10minM: number;
  stale: boolean;
  prev: Status | null;
}

/** moving/idle for a vessel; `alert` is never derived here (it comes from the simulation). */
export function deriveVesselStatus(i: VesselStatusInput): "moving" | "idle" {
  if (i.stale) return "idle";
  const sog = i.sog ?? 0;
  if (isStationaryNavStatus(i.navStatus) && sog < 1.5) return "idle";
  if (sog >= 1.0) return "moving";
  if (sog < 0.5 && i.displacement10minM < 200) return "idle";
  return i.prev === "moving" ? "moving" : "idle";
}

export interface TrainStatusInput {
  displacementM: number;
  speed: number | null | undefined;
  stale: boolean;
}

export function deriveTrainStatus(i: TrainStatusInput): "moving" | "idle" {
  if (i.stale) return "idle";
  if (i.displacementM >= 100) return "moving";
  if ((i.speed ?? 0) >= 5) return "moving";
  return "idle";
}
