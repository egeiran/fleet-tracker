import {
  DAY_MS,
  thinToBuckets,
  vesselCarrierKey,
  type AisMessage,
  type Coverage,
  type EnturVehicle,
  type IngestEvent,
  type Mode,
  type Snapshot,
  type SourceState,
  type Status,
  type TrackPoint,
  type Unit,
} from "@vakt/domain";
import type { DatabaseSync } from "node:sqlite";
import { TIMING, type Config } from "../config";
import { AssignmentsRepo, CarriersRepo, PositionsRepo } from "../db/repos";
import { kvGet, kvSet } from "../db/sqlite";
import { logger } from "../log";
import { CarrierRegistry, isTrain, isVessel, type Observed } from "./carrierRegistry";
import { Fleet, type Slot } from "./fleet";
import { MockPool } from "./mockPool";
import { isVesselMoving, latBand, pickTrain, pickVessel, vesselClass } from "./selection";
import { TrackStore } from "./trackStore";
import { buildLiveUnit } from "./unitBuilder";

const log = logger("fleet");
const ATTRIBUTION = ["Data fra Kystverket / BarentsWatch (NLOD)", "Sanntidsdata fra Entur (NLOD)", "Sensordata simulert"];

export interface ServiceDeps {
  db: DatabaseSync;
  config: Config;
  now?: () => number;
  requestHistory?: (mmsi: number) => void;
}

/**
 * The orchestrator: registry of observed carriers, 60 fixed unit slots, track store, and the
 * versioned snapshot + event stream the web app consumes.
 */
export class FleetService {
  readonly registry = new CarrierRegistry();
  readonly fleet: Fleet;
  readonly tracks: TrackStore;
  readonly positions: PositionsRepo;
  readonly carriers: CarriersRepo;
  readonly mock = new MockPool();
  version = 0;
  coverage: Coverage;
  private listeners = new Set<(e: IngestEvent) => void>();
  private prevStatus = new Map<string, Status>();
  private prevStale = new Map<string, boolean>();
  private lastMessage = { sea: 0, rail: 0 };
  private snapshotCache: { at: number; json: string; bareJson: string; version: number } | null = null;
  private now: () => number;
  private seaMock: boolean;

  constructor(private deps: ServiceDeps) {
    this.now = deps.now ?? Date.now;
    this.positions = new PositionsRepo(deps.db);
    this.carriers = new CarriersRepo(deps.db);
    this.fleet = new Fleet(deps.config.fleet, new AssignmentsRepo(deps.db));
    this.tracks = new TrackStore(this.positions, TIMING.keepMs);
    this.seaMock = !deps.config.barentswatch;
    const road = deps.config.fleet.road;
    this.coverage = {
      sea: this.seaMock
        ? { state: "unavailable", detail: "mangler BARENTSWATCH_CLIENT_ID", carriers: 0, assigned: 0 }
        : { state: "starting", carriers: 0, assigned: 0 },
      rail: { state: "starting", carriers: 0, assigned: 0 },
      road: { state: "mock", carriers: road, assigned: road },
    };
  }

  /* ---------- lifecycle ---------- */

  boot(): void {
    const now = this.now();
    const loaded = this.tracks.loadHot(now);
    const alive = (key: string, mode: Mode) => {
      const carrier = this.carriers.get(key);
      const track = this.tracks.track(key);
      const last = track[track.length - 1];
      if (!carrier || !last) return false;
      const expectedKind = mode === "sjø" ? "vessel" : mode === "bane" ? "train" : "mock";
      if (carrier.kind !== expectedKind) return false;
      if (mode === "sjø" && this.seaMock) return false;
      if (now - last[2] > this.silentMs(mode)) return false;
      this.registry.restore(key, carrier, last);
      return true;
    };
    const { restored, closed } = this.fleet.restore(now, alive);
    this.registry.setPinned(this.fleet.assignedKeys());
    log.info("restored", { points: loaded, restored, closed });
    this.refreshCoverage();
  }

  onEvent(cb: (e: IngestEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(e: IngestEvent): void {
    this.version++;
    this.snapshotCache = null;
    for (const cb of this.listeners) cb(e);
  }

  private silentMs(mode: Mode): number {
    return mode === "sjø" ? TIMING.seaSilentMs : TIMING.railSilentMs;
  }

  get streamSince(): string | null {
    return kvGet(this.deps.db, "stream_since");
  }
  set streamSince(v: string | null) {
    if (v) kvSet(this.deps.db, "stream_since", v);
  }

  /* ---------- ingestion ---------- */

  onAis(m: AisMessage): void {
    const obs = this.registry.observeVessel(m);
    if (!obs) return;
    this.lastMessage.sea = this.now();
    const slots = this.fleet.forCarrier(obs.key);
    if (!slots.length) return;
    const kept = this.tracks.append(
      obs.key,
      obs.point,
      { sog: m.speedOverGround, cog: m.courseOverGround, heading: m.trueHeading, navStatus: m.navigationalStatus },
      "live",
    );
    if (!kept) return;
    this.carriers.upsert(obs.key, obs.carrier, obs.lastSeen);
    for (const s of slots) this.emitPosition(s, obs);
  }

  onTrains(vehicles: EnturVehicle[]): void {
    const now = this.now();
    for (const v of vehicles) {
      const obs = this.registry.observeTrain(v);
      if (!obs) continue;
      const slots = this.fleet.forCarrier(obs.key);
      if (!slots.length) continue;
      const kept = this.tracks.append(obs.key, obs.point, { sog: obs.carrier.kind === "train" ? obs.carrier.speed : null, heading: v.bearing }, "live");
      if (!kept) continue;
      this.carriers.upsert(obs.key, obs.carrier, obs.lastSeen);
      for (const s of slots) this.emitPosition(s, obs);
    }
    this.lastMessage.rail = now;
    if (this.coverage.rail.state !== "ok") this.coverage.rail = { ...this.coverage.rail, state: "ok", detail: undefined };
    if (this.fleet.empty("bane").length) this.rebalance("bane");
    this.refreshCoverage();
  }

  setRailState(patch: Partial<SourceState>): void {
    this.coverage.rail = { ...this.coverage.rail, ...patch };
    this.refreshCoverage();
  }

  /** Seed the registry from the latest-positions snapshot (used at boot before the stream warms up). */
  seedVessels(messages: AisMessage[]): void {
    for (const m of messages) this.registry.observeVessel(m);
    this.lastMessage.sea = this.now();
    this.rebalance("sjø");
  }

  onHistory(mmsi: number, track: TrackPoint[]): void {
    const key = vesselCarrierKey(mmsi);
    if (!this.fleet.forCarrier(key).length) return;
    const added = this.tracks.merge(key, track, "hist");
    log.debug("history merged", { mmsi, added });
    for (const s of this.fleet.forCarrier(key)) this.emitUnit(s);
  }

  setSeaState(patch: Partial<SourceState>): void {
    this.coverage.sea = { ...this.coverage.sea, ...patch };
    this.refreshCoverage();
  }

  /* ---------- assignment ---------- */

  /** Fill empty slots. Never swaps a healthy carrier for a "better" one: stability beats score. */
  rebalance(only?: Mode): void {
    const now = this.now();
    const taken = this.fleet.assignedKeys();
    let changed = 0;

    if (!this.seaMock && (!only || only === "sjø") && this.fleet.empty("sjø").length) {
      const seaSlots = this.fleet.ofMode("sjø");
      // Composition quotas scale with fleet size: ~¼ ro-pax, ~⅛ tankers, ⅔ moving.
      const quota = { passenger: Math.ceil(seaSlots.length / 4), tanker: Math.ceil(seaSlots.length / 8), moving: Math.ceil(seaSlots.length * 0.66) };
      const tally = { bandCounts: [0, 0, 0, 0], passengers: 0, tankers: 0, moving: 0 };
      const count = (o: Observed) => {
        tally.bandCounts[latBand(o.point[1])]!++;
        if (!isVessel(o)) return;
        const cls = vesselClass(o.carrier);
        if (cls === "passasjer") tally.passengers++;
        if (cls === "tank") tally.tankers++;
        if (isVesselMoving(o.carrier)) tally.moving++;
      };
      for (const s of seaSlots) {
        const o = s.carrierKey ? this.registry.get(s.carrierKey) : undefined;
        if (o) count(o);
      }
      const pool = this.registry.vessels();
      for (const slot of this.fleet.empty("sjø")) {
        const pick = pickVessel(slot.unitId, pool, {
          now,
          taken,
          passengerLeft: quota.passenger - tally.passengers,
          tankerLeft: quota.tanker - tally.tankers,
          bandCounts: tally.bandCounts,
          preferMoving: tally.moving < quota.moving,
        });
        if (!pick || !isVessel(pick)) continue;
        this.assign(slot, pick, now);
        taken.add(pick.key);
        count(pick);
        this.deps.requestHistory?.(pick.carrier.mmsi);
        changed++;
      }
    }

    if (only === "sjø") {
      if (changed) log.info("rebalanced", { changed, mode: only });
      this.registry.setPinned(taken);
      this.refreshCoverage();
      return;
    }

    const lineCounts = new Map<string, number>();
    for (const s of this.fleet.ofMode("bane")) {
      const o = s.carrierKey ? this.registry.get(s.carrierKey) : null;
      if (o && isTrain(o) && o.carrier.lineRef) lineCounts.set(o.carrier.lineRef, (lineCounts.get(o.carrier.lineRef) ?? 0) + 1);
    }
    const trains = this.registry.trains();
    for (const slot of this.fleet.empty("bane")) {
      const pick = pickTrain(slot.unitId, trains, { now, taken, lineCounts });
      if (!pick || !isTrain(pick)) continue;
      this.assign(slot, pick, now);
      taken.add(pick.key);
      if (pick.carrier.lineRef) lineCounts.set(pick.carrier.lineRef, (lineCounts.get(pick.carrier.lineRef) ?? 0) + 1);
      changed++;
    }
    if (changed) log.info("rebalanced", { changed });
    this.registry.setPinned(taken);
    this.refreshCoverage();
  }

  private assign(slot: Slot, obs: Observed, now: number): void {
    this.fleet.assign(slot, obs.key, now);
    this.carriers.upsert(obs.key, obs.carrier, obs.lastSeen);
    this.tracks.append(obs.key, obs.point, {}, "live");
    this.emitUnit(slot);
  }

  /** Mark silent carriers stale and free slots whose carrier has been gone too long. */
  sweep(): void {
    const now = this.now();
    let released = 0;
    for (const slot of this.fleet.slots) {
      if (!slot.carrierKey) continue;
      const obs = this.registry.get(slot.carrierKey);
      const lastSeen = obs?.lastSeen ?? 0;
      if (now - lastSeen > this.silentMs(slot.mode)) {
        const key = slot.carrierKey;
        this.fleet.release(slot, now, slot.mode === "bane" ? "train-ended" : "silent");
        this.tracks.forget(key);
        released++;
        continue;
      }
      const unit = this.buildUnit(slot, now);
      if (unit && this.rememberStatus(unit)) {
        this.emit({ type: "status", id: unit.id, status: unit.status, stale: unit.stale, place: unit.place });
      }
    }
    if (released) {
      log.info("released silent carriers", { released });
      this.registry.setPinned(this.fleet.assignedKeys());
      this.rebalance();
    }
    this.registry.evictUnseenSince(now - TIMING.seaSilentMs);
  }

  /** Returns true when status or staleness changed since the last emit. */
  private rememberStatus(unit: Unit): boolean {
    const changed = this.prevStatus.get(unit.id) !== unit.status || this.prevStale.get(unit.id) !== unit.stale;
    this.prevStatus.set(unit.id, unit.status);
    this.prevStale.set(unit.id, unit.stale);
    return changed;
  }

  prune(): void {
    const now = this.now();
    const removed = this.tracks.prune(now);
    const closed = this.fleet.pruneClosedBefore(now - TIMING.keepMs);
    if (removed || closed) log.info("pruned", { positions: removed, assignments: closed });
  }

  flush(): number {
    return this.tracks.flush();
  }

  /* ---------- output ---------- */

  private buildUnit(slot: Slot, now: number): Unit | null {
    if (slot.carrierKey) {
      const obs = this.registry.get(slot.carrierKey);
      const carrier = obs?.carrier ?? this.carriers.get(slot.carrierKey);
      if (!carrier) return null;
      const track = this.tracks.track(slot.carrierKey).filter((p) => p[2] >= now - DAY_MS);
      return buildLiveUnit({
        slot: slot.slot,
        unitId: slot.unitId,
        mode: slot.mode,
        carrier,
        track,
        assignedAt: slot.assignedAt,
        now,
        prevStatus: this.prevStatus.get(slot.unitId) ?? null,
      });
    }
    if (slot.mode === "vei" || (slot.mode === "sjø" && this.seaMock)) {
      const index = slot.slot - (slot.mode === "vei" ? this.deps.config.fleet.sea + this.deps.config.fleet.rail : 0);
      return this.mock.unitFor(slot.mode, index, slot.unitId, slot.slot, now);
    }
    return null;
  }

  private emitPosition(slot: Slot, obs: Observed): void {
    const now = this.now();
    const unit = this.buildUnit(slot, now);
    if (!unit) return;
    const had = this.prevStatus.has(unit.id);
    const changed = this.rememberStatus(unit);
    this.emit({
      type: "position",
      id: unit.id,
      point: obs.point,
      heading: unit.heading,
      sog: obs.carrier.kind === "vessel" ? obs.carrier.sog : undefined,
      status: unit.status,
      stale: unit.stale,
      place: unit.place,
    });
    if (had && changed) this.emit({ type: "status", id: unit.id, status: unit.status, stale: unit.stale, place: unit.place });
  }

  private emitUnit(slot: Slot): void {
    const unit = this.buildUnit(slot, this.now());
    if (!unit) return;
    this.rememberStatus(unit);
    this.emit({ type: "unit", unit: this.thin(unit, this.now()) });
  }

  private refreshCoverage(): void {
    const seaAssigned = this.fleet.ofMode("sjø").filter((s) => s.carrierKey).length;
    const railAssigned = this.fleet.ofMode("bane").filter((s) => s.carrierKey).length;
    const next: Coverage = {
      sea: {
        ...this.coverage.sea,
        carriers: this.registry.count("vessel"),
        assigned: this.seaMock ? this.deps.config.fleet.sea : seaAssigned,
        lastMessageAt: this.lastMessage.sea || undefined,
      },
      rail: { ...this.coverage.rail, carriers: this.registry.count("train"), assigned: railAssigned, lastMessageAt: this.lastMessage.rail || undefined },
      road: this.coverage.road,
    };
    // lastMessageAt ticks constantly; only state/counts/detail changes are worth a broadcast.
    const sig = (c: Coverage) =>
      (["sea", "rail", "road"] as const).map((k) => `${c[k].state}|${c[k].detail ?? ""}|${c[k].carriers}|${c[k].assigned}`).join(";");
    const changed = sig(next) !== sig(this.coverage);
    this.coverage = next;
    if (changed) this.emit({ type: "coverage", coverage: next });
  }

  private thin(unit: Unit, now: number): Unit {
    return { ...unit, track: thinToBuckets(unit.track, { from: now - DAY_MS, to: now }, 200) };
  }

  units(now = this.now()): Unit[] {
    const out: Unit[] = [];
    for (const slot of this.fleet.slots) {
      const u = this.buildUnit(slot, now);
      if (u) out.push(u);
    }
    return out;
  }

  unit(id: string): Unit | null {
    const slot = this.fleet.get(id);
    return slot ? this.buildUnit(slot, this.now()) : null;
  }

  snapshot(): Snapshot {
    const now = this.now();
    const units = this.units(now).map((u) => this.thin(u, now));
    const source: Snapshot["source"] = this.seaMock ? "partial" : this.coverage.sea.state === "ok" ? "live" : "partial";
    return {
      generatedAt: now,
      version: this.version,
      source,
      window: { from: now - DAY_MS, to: now },
      units,
      coverage: this.coverage,
      attribution: ATTRIBUTION,
    };
  }

  /** Memoized JSON so a burst of clients does not rebuild 60 units each. */
  snapshotJson(withTracks = true): { json: string; version: number } {
    const now = this.now();
    if (!this.snapshotCache || now - this.snapshotCache.at >= 2000) {
      const snap = this.snapshot();
      const bare = { ...snap, units: snap.units.map((u) => ({ ...u, track: [] })) };
      this.snapshotCache = { at: now, json: JSON.stringify(snap), bareJson: JSON.stringify(bare), version: snap.version };
    }
    return { json: withTracks ? this.snapshotCache.json : this.snapshotCache.bareJson, version: this.snapshotCache.version };
  }
}
