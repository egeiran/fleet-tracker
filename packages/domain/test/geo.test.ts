import { describe, expect, it } from "vitest";
import { bboxOf, bearingDeg, compass8, haversineM, padBbox, posAt, sliceAt, trailAt } from "../src/geo";
import type { LngLat } from "../src/types";

const path: LngLat[] = [
  [0, 0],
  [1, 0],
  [1, 1],
];

describe("posAt", () => {
  it("handles endpoints and single points", () => {
    expect(posAt([[5, 5]], 0.7)).toEqual([5, 5]);
    expect(posAt(path, 0)).toEqual([0, 0]);
    expect(posAt(path, 1)).toEqual([1, 1]);
  });
  it("interpolates by cumulative length", () => {
    expect(posAt(path, 0.25)).toEqual([0.5, 0]);
    expect(posAt(path, 0.75)).toEqual([1, 0.5]);
  });
});

describe("sliceAt / trailAt", () => {
  it("returns null for degenerate ranges", () => {
    expect(sliceAt(path, 0.5, 0.5)).toBeNull();
    expect(sliceAt([[0, 0]], 0, 1)).toBeNull();
    expect(trailAt([[0, 0]], 0.5)).toBeNull();
  });
  it("includes interior vertices inside the slice", () => {
    expect(sliceAt(path, 0.25, 0.75)).toEqual([
      [0.5, 0],
      [1, 0],
      [1, 0.5],
    ]);
  });
  it("trail runs from the start to the current position", () => {
    expect(trailAt(path, 0.75)).toEqual([
      [0, 0],
      [1, 0],
      [1, 0.5],
    ]);
  });
});

describe("bbox helpers", () => {
  it("pads a zero-extent box so fitBounds has something to frame", () => {
    const b = padBbox([
      [10, 60],
      [10, 60],
    ]);
    expect(b[1][0] - b[0][0]).toBeCloseTo(0.04);
    expect(b[1][1] - b[0][1]).toBeCloseTo(0.024);
  });
  it("uses 25 % of the extent when larger than the minimum", () => {
    const b = padBbox([
      [0, 0],
      [1, 1],
    ]);
    expect(b[0][0]).toBeCloseTo(-0.25);
    expect(b[1][1]).toBeCloseTo(1.25);
  });
  it("bboxOf returns null for empty input", () => {
    expect(bboxOf([])).toBeNull();
  });
});

describe("haversine / bearing", () => {
  it("Oslo–Bergen is roughly 305 km", () => {
    expect(haversineM([10.7522, 59.9139], [5.3221, 60.3913]) / 1000).toBeCloseTo(305, -1);
  });
  it("bearing north is 0 and compass labels are Norwegian", () => {
    expect(bearingDeg([10, 59], [10, 60])).toBeCloseTo(0);
    expect(compass8(45)).toBe("NØ");
    expect(compass8(359)).toBe("N");
    expect(compass8(215)).toBe("SV");
  });
});
