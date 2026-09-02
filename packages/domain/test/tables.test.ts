import { describe, expect, it } from "vitest";
import { unitIdsForSlots } from "../src/ids";
import { navStatusLabel } from "../src/navStatus";
import { shipTypeInfo } from "../src/shipTypes";
import { deriveTrainStatus, deriveVesselStatus, isStale } from "../src/status";
import { formatClock, formatEventTime, hoursBack, tLabel, timeAt } from "../src/time";

describe("shipTypeInfo", () => {
  it("maps ITU decades to classes", () => {
    expect(shipTypeInfo(70).class).toBe("last");
    expect(shipTypeInfo(79).label).toBe("lasteskip");
    expect(shipTypeInfo(80).class).toBe("tank");
    expect(shipTypeInfo(89).class).toBe("tank");
    expect(shipTypeInfo(60).class).toBe("passasjer");
    expect(shipTypeInfo(69).class).toBe("passasjer");
    expect(shipTypeInfo(30).class).toBe("fiske");
    expect(shipTypeInfo(37).class).toBe("fritid");
    expect(shipTypeInfo(52).label).toBe("taubåt");
    expect(shipTypeInfo(0).class).toBe("ukjent");
    expect(shipTypeInfo(null).class).toBe("ukjent");
  });
  it("labels nav status", () => {
    expect(navStatusLabel(5)).toBe("fortøyd");
    expect(navStatusLabel(99)).toBeUndefined();
  });
});

describe("status derivation", () => {
  it("vessel: moored beats speed jitter; SOG drives moving; hysteresis in between", () => {
    const base = { displacement10minM: 0, stale: false, prev: null };
    expect(deriveVesselStatus({ ...base, sog: 0.3, navStatus: 5 })).toBe("idle");
    expect(deriveVesselStatus({ ...base, sog: 12, navStatus: 0 })).toBe("moving");
    expect(deriveVesselStatus({ ...base, sog: 0.7, navStatus: 0, prev: "moving", displacement10minM: 300 })).toBe(
      "moving",
    );
    expect(deriveVesselStatus({ ...base, sog: 0.2, navStatus: 0 })).toBe("idle");
    expect(deriveVesselStatus({ ...base, sog: 12, navStatus: 0, stale: true })).toBe("idle");
  });
  it("train: displacement or speed", () => {
    expect(deriveTrainStatus({ displacementM: 150, speed: null, stale: false })).toBe("moving");
    expect(deriveTrainStatus({ displacementM: 10, speed: 20, stale: false })).toBe("moving");
    expect(deriveTrainStatus({ displacementM: 10, speed: 0, stale: false })).toBe("idle");
    expect(deriveTrainStatus({ displacementM: 500, speed: 50, stale: true })).toBe("idle");
  });
  it("isStale after 10 minutes", () => {
    expect(isStale(0, 9 * 60_000)).toBe(false);
    expect(isStale(0, 11 * 60_000)).toBe(true);
  });
});

describe("ids", () => {
  it("produces 60 unique stable ids", () => {
    const ids = unitIdsForSlots(60);
    expect(new Set(ids).size).toBe(60);
    expect(ids.every((id) => /^VKT-\d{4}$/.test(id))).toBe(true);
    expect(unitIdsForSlots(60)).toEqual(ids);
  });
});

describe("time", () => {
  it("hoursBack/tLabel follow the prototype", () => {
    expect(hoursBack(100)).toBe(0);
    expect(tLabel(100)).toBe("nå");
    expect(tLabel(0)).toBe("−24 t");
    expect(tLabel(50)).toBe("−12 t");
  });
  it("timeAt maps 0–100 onto the window", () => {
    expect(timeAt({ from: 0, to: 1000 }, 25)).toBe(250);
  });
  it("formatEventTime adds a day hint for older events", () => {
    const now = Date.UTC(2026, 8, 2, 19, 0);
    expect(formatEventTime(now - 3_600_000, now)).toBe("20:00");
    expect(formatEventTime(now - 23 * 3_600_000, now)).toBe("i går 22:00");
    expect(formatEventTime(now - 3 * 86_400_000, now)).toBe("30.08 21:00");
  });
  it("formatClock renders HH:MM in Oslo time", () => {
    expect(formatClock(Date.UTC(2026, 8, 2, 9, 20))).toBe("11:20");
    expect(formatClock(Date.UTC(2026, 8, 2, 9, 20), "UTC")).toBe("09:20");
  });
});
