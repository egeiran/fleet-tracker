import { describe, expect, it } from "vitest";
import { buildFleet, MOCK_NOW } from "../src/fleet";

describe("buildFleet", () => {
  it("is deterministic and honours the requested size", () => {
    const a = buildFleet({ size: 60 });
    const b = buildFleet({ size: 60 });
    expect(a.map((u) => u.id)).toEqual(b.map((u) => u.id));
    expect(a.length).toBeGreaterThanOrEqual(55);
    expect(a.length).toBeLessThanOrEqual(60);
    expect(buildFleet({ size: 12 })).toHaveLength(12);
  });
  it("starts with the hero units and never mentions the old brand", () => {
    const fleet = buildFleet();
    expect(fleet.slice(0, 5).map((u) => u.id)).toEqual(["VKT-0917", "VKT-4471", "VKT-2481", "VKT-5093", "VKT-6612"]);
    const json = JSON.stringify(fleet);
    expect(json).not.toMatch(/BLDR|Balder/);
    expect(new Set(fleet.map((u) => u.id)).size).toBe(fleet.length);
  });
  it("gives every unit a route, a sampled 24 h track and the right shape", () => {
    for (const u of buildFleet({ size: 120 })) {
      expect(u.path!.length).toBeGreaterThan(0);
      expect(u.track.length).toBe(25);
      expect(u.track[u.track.length - 1]![2]).toBe(MOCK_NOW);
      expect(u.door).toBe(u.status === "alert" ? "åpen" : "lukket");
      expect(u.events.length).toBeGreaterThan(0);
      expect(u.events.every((e) => Number.isFinite(e.ts) && e.ts <= MOCK_NOW)).toBe(true);
      if (u.status === "idle") expect(u.progress).toBe(1);
    }
  });
});
