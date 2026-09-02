import { describe, expect, it } from "vitest";
import type { Observed } from "../src/core/carrierRegistry";
import { pickTrain, pickVessel, vesselEligible } from "../src/core/selection";

function vessel(mmsi: number, over: Partial<Extract<Observed["carrier"], { kind: "vessel" }>> = {}, lat = 60): Observed {
  return {
    key: `ais:${mmsi}`,
    carrier: { kind: "vessel", mmsi, name: `V${mmsi}`, shipType: 70, shipTypeLabel: "lasteskip", lengthM: 90, sog: 8, lastSeen: 1000, ...over },
    point: [5, lat, 1000],
    prevPoint: null,
    lastSeen: 1000,
  };
}

const ctx = () => ({ now: 1000, taken: new Set<string>(), passengerLeft: 8, tankerLeft: 4, bandCounts: [0, 0, 0, 0], preferMoving: true });

describe("vessel selection", () => {
  it("applies class and length gates", () => {
    expect(vesselEligible(vessel(1).carrier as never, ctx())).toBe(true);
    expect(vesselEligible(vessel(2, { lengthM: 20 }).carrier as never, ctx())).toBe(false);
    expect(vesselEligible(vessel(3, { shipType: 60, lengthM: 50 }).carrier as never, ctx())).toBe(false);
    expect(vesselEligible(vessel(4, { shipType: 60, lengthM: 150 }).carrier as never, ctx())).toBe(true);
    expect(vesselEligible(vessel(5, { shipType: 60, lengthM: 150 }).carrier as never, { ...ctx(), passengerLeft: 0 })).toBe(false);
    expect(vesselEligible(vessel(6, { shipType: 30 }).carrier as never, ctx())).toBe(false);
    expect(vesselEligible(vessel(7, { name: "MMSI 7" }).carrier as never, ctx())).toBe(false);
  });
  it("prefers moving, recent vessels and is deterministic", () => {
    const pool = [vessel(1, { sog: 0, navStatus: 5 }), vessel(2, { sog: 10, destination: "Bergen" }), vessel(3, { sog: 10 })];
    expect(pickVessel("VKT-1", pool, ctx())!.key).toBe("ais:2");
    expect(pickVessel("VKT-1", pool, ctx())!.key).toBe("ais:2");
    expect(pickVessel("VKT-1", pool, { ...ctx(), preferMoving: false })!.key).toBe("ais:1");
    expect(pickVessel("VKT-1", pool, { ...ctx(), taken: new Set(["ais:2"]) })!.key).toBe("ais:3");
  });
  it("spreads picks across latitude bands", () => {
    const pool = [vessel(1, {}, 59), vessel(2, {}, 63)];
    expect(pickVessel("VKT-1", pool, { ...ctx(), bandCounts: [0, 5, 0, 0] })!.key).toBe("ais:2");
  });
});

describe("train selection", () => {
  const train = (id: string, lineRef: string | undefined, moving: boolean): Observed => ({
    key: `entur:VYG:${id}`,
    carrier: { kind: "train", vehicleId: id, codespace: "VYG", operatorLabel: "Vy", lineRef, origin: "A", destination: "B", delaySec: 0, lastSeen: 1000 },
    point: [10, 60, 1000],
    prevPoint: moving ? [10.01, 60, 900] : [10, 60, 900],
    lastSeen: 1000,
  });
  it("prefers moving trains with lines and limits two per line", () => {
    const pool = [train("a", "L1", false), train("b", "L1", true), train("c", "L2", true)];
    expect(pickTrain("VKT-9", pool, { now: 1000, taken: new Set(), lineCounts: new Map() })!.key).toMatch(/entur:VYG:(b|c)/);
    expect(pickTrain("VKT-9", pool, { now: 1000, taken: new Set(), lineCounts: new Map([["L1", 2]]) })!.key).toBe("entur:VYG:c");
  });
  it("ignores stale trains", () => {
    expect(pickTrain("VKT-9", [train("a", "L1", true)], { now: 1000 + 11 * 60_000, taken: new Set(), lineCounts: new Map() })).toBeNull();
  });
});
