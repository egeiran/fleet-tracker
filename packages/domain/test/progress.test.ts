import { describe, expect, it } from "vitest";
import { fracAtTime, fracMock } from "../src/progress";
import type { LngLat } from "../src/types";

describe("fracMock", () => {
  it("scales progress like the prototype", () => {
    expect(fracMock(1, 100)).toBe(1);
    expect(fracMock(1, 0)).toBeCloseTo(0.32);
    expect(fracMock(0.5, 50)).toBeCloseTo(0.5 * (0.32 + 0.34));
    expect(fracMock(2, 100)).toBe(1);
  });
});

describe("fracAtTime", () => {
  const path: LngLat[] = [
    [0, 0],
    [1, 0],
    [1, 3],
  ];
  const ts = [1000, 2000, 5000];
  it("clamps before and after coverage", () => {
    expect(fracAtTime(path, ts, 0)).toBe(0);
    expect(fracAtTime(path, ts, 9000)).toBe(1);
  });
  it("interpolates inside a segment with unequal spacing", () => {
    expect(fracAtTime(path, ts, 1500)).toBeCloseTo(0.5 / 4);
    expect(fracAtTime(path, ts, 3500)).toBeCloseTo((1 + 1.5) / 4);
  });
  it("handles empty and single-point tracks", () => {
    expect(fracAtTime([], [], 100)).toBe(0);
    expect(fracAtTime([[0, 0]], [10], 100)).toBe(0);
  });
});
