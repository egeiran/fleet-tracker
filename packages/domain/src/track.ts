import { haversineM } from "./geo";
import type { LngLat, TimeWindow, TrackPoint } from "./types";

export interface Interpolated {
  pos: LngLat;
  beforeCoverage: boolean;
  afterCoverage: boolean;
}

/** Position on a timestamped track at `time`; clamps outside the covered span. */
export function interpolateAt(track: TrackPoint[], time: number): Interpolated | null {
  const n = track.length;
  if (n === 0) return null;
  const first = track[0]!;
  const last = track[n - 1]!;
  if (time <= first[2]) return { pos: [first[0], first[1]], beforeCoverage: time < first[2], afterCoverage: false };
  if (time >= last[2]) return { pos: [last[0], last[1]], beforeCoverage: false, afterCoverage: time > last[2] };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid]![2] <= time) lo = mid;
    else hi = mid;
  }
  const a = track[lo]!;
  const b = track[hi]!;
  const q = b[2] === a[2] ? 1 : (time - a[2]) / (b[2] - a[2]);
  return {
    pos: [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q],
    beforeCoverage: false,
    afterCoverage: false,
  };
}

export interface DownsampleRule {
  minIntervalMs: number;
  minDistanceM: number;
  hardMinIntervalMs: number;
}

export const DEFAULT_DOWNSAMPLE: DownsampleRule = {
  minIntervalMs: 60_000,
  minDistanceM: 50,
  hardMinIntervalMs: 5_000,
};

/** Keep a point when enough time passed or the carrier moved; never two points within 5 s. */
export function shouldKeepPoint(
  prev: TrackPoint | undefined,
  next: TrackPoint,
  rule: DownsampleRule = DEFAULT_DOWNSAMPLE,
): boolean {
  if (!prev) return true;
  const dt = next[2] - prev[2];
  if (dt < rule.hardMinIntervalMs) return false;
  if (dt >= rule.minIntervalMs) return true;
  return haversineM([prev[0], prev[1]], [next[0], next[1]]) >= rule.minDistanceM;
}

/** Downsample a whole sorted track with the same rule (used for history loads). */
export function downsampleTrack(track: TrackPoint[], rule: DownsampleRule = DEFAULT_DOWNSAMPLE): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (const p of track) {
    if (shouldKeepPoint(out[out.length - 1], p, rule)) out.push(p);
  }
  return out;
}

/**
 * Thin to at most `max` points by time buckets across the window, keeping the last point per
 * bucket plus the first and last point overall. Order and monotonic timestamps are preserved.
 */
export function thinToBuckets(track: TrackPoint[], window: TimeWindow, max: number): TrackPoint[] {
  if (track.length <= max || max < 3) return track;
  const span = Math.max(1, window.to - window.from);
  const bucketMs = span / (max - 2);
  const byBucket = new Map<number, TrackPoint>();
  for (const p of track) {
    const b = Math.floor((p[2] - window.from) / bucketMs);
    byBucket.set(b, p);
  }
  const chosen = [...byBucket.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
  const first = track[0]!;
  const last = track[track.length - 1]!;
  const out: TrackPoint[] = [];
  if (chosen[0] !== first) out.push(first);
  for (const p of chosen) {
    if (p === first && out.length) continue;
    if (p === last) continue;
    out.push(p);
  }
  out.push(last);
  // Guard for the rare case where bucket assignment produced more than `max` points.
  while (out.length > max) out.splice(1, 1);
  return out;
}

export function sortTrack(track: TrackPoint[]): TrackPoint[] {
  return [...track].sort((a, b) => a[2] - b[2]);
}

export function coverageOf(track: TrackPoint[]): { from: number | null; to: number | null } {
  if (track.length === 0) return { from: null, to: null };
  return { from: track[0]![2], to: track[track.length - 1]![2] };
}

/** Straight-line displacement between the last point at/before `time - lookbackMs` and the last point. */
export function displacementM(track: TrackPoint[], lookbackMs: number): number {
  if (track.length < 2) return 0;
  const last = track[track.length - 1]!;
  const cutoff = last[2] - lookbackMs;
  let ref = track[0]!;
  for (let i = track.length - 2; i >= 0; i--) {
    if (track[i]![2] <= cutoff) {
      ref = track[i]!;
      break;
    }
  }
  return haversineM([ref[0], ref[1]], [last[0], last[1]]);
}

export function splitPath(track: TrackPoint[]): { path: LngLat[]; timestamps: number[] } {
  const path: LngLat[] = new Array(track.length);
  const timestamps: number[] = new Array(track.length);
  for (let i = 0; i < track.length; i++) {
    const p = track[i]!;
    path[i] = [p[0], p[1]];
    timestamps[i] = p[2];
  }
  return { path, timestamps };
}
