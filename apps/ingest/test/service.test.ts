import { describe, expect, it } from "vitest";
import type { AisMessage, EnturVehicle, IngestEvent } from "@vakt/domain";
import { loadConfig } from "../src/config";
import { FleetService } from "../src/core/service";
import { openDb } from "../src/db/sqlite";

function ais(mmsi: number, lon: number, lat: number, ts: number, over: Partial<AisMessage> = {}): AisMessage {
  return {
    mmsi,
    msgtime: new Date(ts).toISOString(),
    longitude: lon,
    latitude: lat,
    speedOverGround: 9,
    courseOverGround: 180,
    navigationalStatus: 0,
    name: `SHIP ${mmsi}`,
    shipType: 70,
    shipLength: 120,
    destination: "NOBGO",
    ...over,
  };
}

function train(id: string, lon: number, lat: number, ts: number): EnturVehicle {
  return {
    vehicleId: id,
    mode: "RAIL",
    codespace: { codespaceId: "VYG" },
    line: { lineRef: `VYG:Line:${id}`, lineName: "Oslo S-Bergen", publicCode: "F4" },
    location: { latitude: lat, longitude: lon },
    lastUpdated: new Date(ts).toISOString(),
    lastUpdatedEpochSecond: ts / 1000,
    delay: 60,
    originName: "Oslo S",
    destinationName: "Bergen",
  };
}

function make(env: Record<string, string> = {}) {
  let now = Date.UTC(2026, 8, 2, 10, 0, 0);
  const config = loadConfig({ FLEET_SEA: "3", FLEET_RAIL: "2", FLEET_ROAD: "2", BARENTSWATCH_CLIENT_ID: "x", BARENTSWATCH_CLIENT_SECRET: "y", ...env });
  const db = openDb(":memory:");
  const events: IngestEvent[] = [];
  const history: number[] = [];
  const svc = new FleetService({ db, config, now: () => now, requestHistory: (m) => history.push(m) });
  svc.onEvent((e) => events.push(e));
  svc.boot();
  return { svc, db, events, history, config, tick: (ms: number) => (now += ms), now: () => now };
}

describe("FleetService", () => {
  it("serves road mock units immediately and fills sea/rail slots from observations", () => {
    const { svc, events, history, tick } = make();
    let snap = svc.snapshot();
    expect(snap.units.map((u) => u.mode)).toEqual(["vei", "vei"]);
    expect(snap.source).toBe("partial");

    const t0 = svc.snapshot().generatedAt;
    svc.seedVessels([ais(1, 5.2, 60.3, t0), ais(2, 10.5, 59.5, t0), ais(3, 8.0, 58.2, t0, { speedOverGround: 0, navigationalStatus: 5 }), ais(4, 6, 62, t0, { shipType: 30 })]);
    expect(history.sort()).toEqual([1, 2, 3]);
    svc.onTrains([train("11", 10.7, 59.9, t0), train("12", 8.4, 60.5, t0)]);
    snap = svc.snapshot();
    expect(snap.units).toHaveLength(7);
    expect(snap.coverage.sea.assigned).toBe(3);
    expect(snap.coverage.rail.state).toBe("ok");
    const sea = snap.units.filter((u) => u.mode === "sjø");
    expect(sea.every((u) => u.carrier.kind === "vessel" && u.source === "live")).toBe(true);
    expect(sea.every((u) => u.sensors === "simulert")).toBe(true);
    expect(events.some((e) => e.type === "unit")).toBe(true);

    // A live position for an assigned vessel produces a position event and grows the track.
    tick(120_000);
    svc.onAis(ais(1, 5.25, 60.32, t0 + 120_000));
    const pos = events.filter((e) => e.type === "position");
    expect(pos.length).toBe(1);
    expect(pos[0]).toMatchObject({ id: expect.any(String), place: expect.stringContaining("Bergen") });
    const u1 = svc.units().find((u) => u.carrier.kind === "vessel" && u.carrier.mmsi === 1)!;
    expect(u1.track.length).toBe(2);
    expect(u1.status).toMatch(/moving|alert/);
    expect(u1.place).toContain("Bergen");

    // History merges older points and re-emits the unit.
    svc.onHistory(1, [[5.0, 60.1, t0 - 3_600_000], [5.1, 60.2, t0 - 1_800_000]]);
    expect(svc.units().find((u) => u.carrier.kind === "vessel" && u.carrier.mmsi === 1)!.track.length).toBe(4);
  });

  it("restores assignments across restarts and releases silent carriers", () => {
    const a = make();
    const t0 = a.now();
    a.svc.seedVessels([ais(7, 5.2, 60.3, t0)]);
    a.svc.onTrains([train("21", 10.7, 59.9, t0)]);
    a.svc.flush();
    const beforeIds = a.svc.units().filter((u) => u.carrier.kind !== "mock").map((u) => [u.id, u.carrier.kind === "vessel" ? u.carrier.mmsi : (u.carrier as { vehicleId: string }).vehicleId]);

    const b = new FleetService({ db: a.db, config: a.config, now: a.now });
    b.boot();
    const afterIds = b.units().filter((u) => u.carrier.kind !== "mock").map((u) => [u.id, u.carrier.kind === "vessel" ? u.carrier.mmsi : (u.carrier as { vehicleId: string }).vehicleId]);
    expect(afterIds).toEqual(beforeIds);

    a.tick(7 * 3_600_000);
    a.svc.sweep();
    expect(a.svc.fleet.assignedKeys().size).toBe(0);
  });

  it("does not restore a vessel into a slot whose mode changed", () => {
    const a = make({ FLEET_SEA: "2", FLEET_RAIL: "1" });
    a.svc.seedVessels([ais(7, 5.2, 60.3, a.now()), ais(8, 10.5, 59.5, a.now())]);
    a.svc.flush();
    const shrunk = loadConfig({ FLEET_SEA: "1", FLEET_RAIL: "2", FLEET_ROAD: "2", BARENTSWATCH_CLIENT_ID: "x", BARENTSWATCH_CLIENT_SECRET: "y" });
    const b = new FleetService({ db: a.db, config: shrunk, now: a.now });
    b.boot();
    const rail = b.units().filter((u) => u.mode === "bane");
    expect(rail.every((u) => u.carrier.kind !== "vessel")).toBe(true);
    expect(b.units().filter((u) => u.mode === "sjø" && u.carrier.kind === "vessel")).toHaveLength(1);
  });

  it("keeps assigned carriers in the registry under LRU pressure", () => {
    const { svc } = make();
    const t0 = svc.snapshot().generatedAt;
    svc.seedVessels([ais(1, 5.2, 60.3, t0)]);
    const key = [...svc.fleet.assignedKeys()][0]!;
    for (let i = 0; i < 6000; i++) svc.registry.observeVessel(ais(100_000 + i, 5 + (i % 10) / 10, 58 + (i % 50) / 10, t0 + i));
    expect(svc.registry.get(key)).toBeDefined();
  });

  it("broadcasts coverage state changes even when counts are unchanged", () => {
    const { svc, events } = make();
    const before = events.filter((e) => e.type === "coverage").length;
    svc.setRailState({ state: "degraded", detail: "Entur svarer ikke" });
    const after = events.filter((e) => e.type === "coverage");
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1]).toMatchObject({ coverage: { rail: { state: "degraded" } } });
    svc.setRailState({ state: "degraded", detail: "Entur svarer ikke" });
    expect(events.filter((e) => e.type === "coverage").length).toBe(before + 1);
  });

  it("uses mock sea units when credentials are missing", () => {
    const { svc } = make({ BARENTSWATCH_CLIENT_ID: "", BARENTSWATCH_CLIENT_SECRET: "", AIS_CLIENT_ID: "", CLIENT_SECRET: "" });
    const snap = svc.snapshot();
    expect(snap.coverage.sea.state).toBe("unavailable");
    expect(snap.units.filter((u) => u.mode === "sjø")).toHaveLength(3);
    expect(snap.units.every((u) => u.source === "mock")).toBe(true);
  });
});
