import { segLengths } from "./geo";
import type { LngLat } from "./types";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Prototype time-warp: the slider scales progress along the synthetic route. */
export function fracMock(progress: number, t: number): number {
  return clamp01(progress * (0.32 + 0.68 * (t / 100)));
}

/**
 * Fraction of route length reached at `time`, given a path with one timestamp per vertex.
 * Binary search on timestamps, linear interpolation inside the segment, converted to the
 * cumulative-distance fraction that `posAt` expects.
 */
export function fracAtTime(path: LngLat[], timestamps: number[], time: number): number {
  const n = Math.min(path.length, timestamps.length);
  if (n === 0) return 0;
  if (n === 1) return 0;
  if (time <= timestamps[0]!) return 0;
  if (time >= timestamps[n - 1]!) return 1;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (timestamps[mid]! <= time) lo = mid;
    else hi = mid;
  }
  const { seg, total } = segLengths(path);
  if (total === 0) return 1;
  let acc = 0;
  for (let i = 0; i < lo; i++) acc += seg[i]!;
  const t0 = timestamps[lo]!;
  const t1 = timestamps[hi]!;
  const q = t1 === t0 ? 1 : (time - t0) / (t1 - t0);
  return clamp01((acc + seg[lo]! * q) / total);
}
