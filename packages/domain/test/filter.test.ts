import { describe, expect, it } from "vitest";
import { applyFilters, countsByStatus, EMPTY_FILTERS, matches } from "../src/filter";
import { sortUnits } from "../src/sort";
import type { Unit } from "../src/types";

function unit(over: Partial<Unit>): Unit {
  return {
    id: "VKT-1000",
    slot: 0,
    status: "moving",
    mode: "sjø",
    source: "mock",
    stale: false,
    position: [10, 60],
    positionTs: 0,
    place: "Skagerrak · underveis Oslo → Rotterdam",
    batt: 90,
    temp: 5,
    door: "lukket",
    booking: "BK-40921",
    cargoLabel: "papirruller",
    sensors: "simulert",
    events: [],
    carrier: { kind: "mock", lane: ["oslo", "rotterdam"], label: "" },
    track: [],
    trackCoverageFrom: null,
    trackCoverageTo: null,
    ...over,
  };
}

const fleet = [
  unit({ id: "VKT-3", status: "idle", mode: "bane", batt: 30, booking: "ubooket" }),
  unit({ id: "VKT-1", status: "alert", mode: "vei" }),
  unit({ id: "VKT-2", status: "moving" }),
  unit({ id: "VKT-0", status: "alert", mode: "sjø", cargoLabel: "sjømat" }),
];

describe("matches", () => {
  it("filters by status, mode and battery", () => {
    expect(applyFilters(fleet, { ...EMPTY_FILTERS, status: "alert" }).map((u) => u.id)).toEqual([
      "VKT-1",
      "VKT-0",
    ]);
    expect(applyFilters(fleet, { ...EMPTY_FILTERS, modes: ["bane", "vei"] })).toHaveLength(2);
    expect(applyFilters(fleet, { ...EMPTY_FILTERS, lowBatt: true }).map((u) => u.id)).toEqual(["VKT-3"]);
  });
  it("searches id, place, mode, booking and cargo case-insensitively", () => {
    expect(matches(fleet[0]!, { ...EMPTY_FILTERS, q: "UBOOKET" })).toBe(true);
    expect(matches(fleet[3]!, { ...EMPTY_FILTERS, q: "sjømat" })).toBe(true);
    expect(matches(fleet[2]!, { ...EMPTY_FILTERS, q: "rotterdam" })).toBe(true);
    expect(matches(fleet[2]!, { ...EMPTY_FILTERS, q: "zzz" })).toBe(false);
    expect(matches(fleet[2]!, { ...EMPTY_FILTERS, q: "   " })).toBe(true);
  });
});

describe("sortUnits / counts", () => {
  it("orders alert → moving → idle then by id", () => {
    expect(sortUnits(fleet).map((u) => u.id)).toEqual(["VKT-0", "VKT-1", "VKT-2", "VKT-3"]);
  });
  it("counts per status", () => {
    expect(countsByStatus(fleet)).toEqual({ all: 4, moving: 1, idle: 1, alert: 2 });
  });
});
