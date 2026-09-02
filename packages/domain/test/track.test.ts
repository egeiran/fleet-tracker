import { describe, expect, it } from "vitest";
import {
  displacementM,
  downsampleTrack,
  interpolateAt,
  shouldKeepPoint,
  sortTrack,
  thinToBuckets,
} from "../src/track";
import type { TrackPoint } from "../src/types";

const track: TrackPoint[] = [
  [10, 60, 1000],
  [10.1, 60, 2000],
  [10.1, 60.1, 4000],
];

describe("interpolateAt", () => {
  it("returns null on empty, clamps outside coverage", () => {
    expect(interpolateAt([], 5)).toBeNull();
    expect(interpolateAt(track, 0)).toMatchObject({ pos: [10, 60], beforeCoverage: true });
    expect(interpolateAt(track, 9000)).toMatchObject({ pos: [10.1, 60.1], afterCoverage: true });
  });
  it("interpolates between points", () => {
    expect(interpolateAt(track, 1500)!.pos).toEqual([10.05, 60]);
    expect(interpolateAt(track, 3000)!.pos[1]).toBeCloseTo(60.05);
    expect(interpolateAt(track, 2000)!.pos).toEqual([10.1, 60]);
  });
});

describe("downsampling", () => {
  it("keeps points on time or distance thresholds, never within 5 s", () => {
    const a: TrackPoint = [10, 60, 0];
    expect(shouldKeepPoint(undefined, a)).toBe(true);
    expect(shouldKeepPoint(a, [10, 60, 61_000])).toBe(true);
    expect(shouldKeepPoint(a, [10.001, 60, 30_000])).toBe(true); // ~56 m
    expect(shouldKeepPoint(a, [10.0001, 60, 30_000])).toBe(false); // ~6 m
    expect(shouldKeepPoint(a, [10.01, 60, 3_000])).toBe(false);
  });
  it("downsampleTrack applies the rule sequentially", () => {
    const dense: TrackPoint[] = Array.from({ length: 100 }, (_, i) => [10, 60, i * 10_000]);
    expect(downsampleTrack(dense)).toHaveLength(17);
  });
});

describe("thinToBuckets", () => {
  it("never exceeds max and keeps first/last in order", () => {
    const dense: TrackPoint[] = Array.from({ length: 2000 }, (_, i) => [10 + i / 1000, 60, i * 43_200]);
    const w = { from: 0, to: 2000 * 43_200 };
    const out = thinToBuckets(dense, w, 200);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out[0]).toBe(dense[0]);
    expect(out[out.length - 1]).toBe(dense[dense.length - 1]);
    for (let i = 1; i < out.length; i++) expect(out[i]![2]).toBeGreaterThan(out[i - 1]![2]);
  });
  it("returns the input untouched when already small", () => {
    expect(thinToBuckets(track, { from: 0, to: 5000 }, 200)).toBe(track);
  });
});

describe("misc", () => {
  it("sortTrack orders by timestamp", () => {
    expect(sortTrack([track[2]!, track[0]!, track[1]!])).toEqual(track);
  });
  it("displacementM measures distance over the lookback", () => {
    expect(displacementM(track, 10_000)).toBeGreaterThan(10_000);
    expect(displacementM([track[0]!], 1000)).toBe(0);
  });
});
