import {
  deriveTrainStatus,
  deriveVesselStatus,
  fnv1a,
  haversineM,
  shipTypeInfo,
  STALE_AFTER_MS,
  type CarrierTrain,
  type CarrierVessel,
} from "@vakt/domain";
import { isTrain, isVessel, type Observed } from "./carrierRegistry";

export interface VesselPickContext {
  now: number;
  taken: Set<string>;
  /** Remaining quota for ro-pax and tanker picks. */
  passengerLeft: number;
  tankerLeft: number;
  /** Count of already assigned vessels per latitude band (0–3). */
  bandCounts: number[];
  /** True when the fleet still needs moving vessels; false when idle ones are wanted. */
  preferMoving: boolean;
}

/** Snapshot rows can be hours old; never board a vessel we have not heard from recently. */
export const VESSEL_MAX_AGE_MS = 30 * 60_000;

export function latBand(lat: number): number {
  if (lat < 56) return 0;
  if (lat < 59.5) return 1;
  if (lat < 62) return 2;
  return 3;
}

/** Eligibility rules from the plan: cargo first, big ro-pax second, a few tankers last. */
export function vesselEligible(v: CarrierVessel, ctx: Pick<VesselPickContext, "passengerLeft" | "tankerLeft">): boolean {
  if (!v.name || v.name.startsWith("MMSI ")) return false;
  const cls = shipTypeInfo(v.shipType).class;
  if (cls === "last") return (v.lengthM ?? 60) >= 40;
  if (cls === "passasjer") return ctx.passengerLeft > 0 && (v.lengthM ?? 0) >= 90;
  if (cls === "tank") return ctx.tankerLeft > 0;
  return false;
}

/** Same rule the unit builder uses, so the balancer's "moving" matches what the UI shows. */
export function isVesselMoving(v: CarrierVessel): boolean {
  return deriveVesselStatus({ sog: v.sog, navStatus: v.navStatus, displacement10minM: 0, stale: false, prev: null }) === "moving";
}

export function vesselClass(v: CarrierVessel): ReturnType<typeof shipTypeInfo>["class"] {
  return shipTypeInfo(v.shipType).class;
}

function vesselScore(v: CarrierVessel, o: Observed, ctx: VesselPickContext): number {
  const moving = isVesselMoving(v);
  let s = 0;
  if (ctx.preferMoving ? moving : !moving) s += 3;
  if (ctx.now - o.lastSeen < STALE_AFTER_MS) s += 2;
  if (v.destination) s += 1;
  if ((v.lengthM ?? 0) >= 80) s += 1;
  s -= (ctx.bandCounts[latBand(o.point[1])] ?? 0) * 0.6;
  return s;
}

/** Deterministic pick for one slot: best score, ties broken by a hash of unit id + carrier key. */
export function pickVessel(unitId: string, pool: Observed[], ctx: VesselPickContext): Observed | null {
  let best: { o: Observed; s: number; h: number } | null = null;
  for (const o of pool) {
    if (!isVessel(o) || ctx.taken.has(o.key)) continue;
    if (ctx.now - o.lastSeen > VESSEL_MAX_AGE_MS) continue;
    if (!vesselEligible(o.carrier, ctx)) continue;
    const s = vesselScore(o.carrier, o, ctx);
    const h = fnv1a(`${unitId}:${o.key}`);
    if (!best || s > best.s || (s === best.s && h < best.h)) best = { o, s, h };
  }
  return best?.o ?? null;
}

export interface TrainPickContext {
  now: number;
  taken: Set<string>;
  lineCounts: Map<string, number>;
}

export function isTrainMoving(o: Observed & { carrier: CarrierTrain }): boolean {
  const displacementM = o.prevPoint ? haversineM([o.prevPoint[0], o.prevPoint[1]], [o.point[0], o.point[1]]) : 0;
  return deriveTrainStatus({ displacementM, speed: o.carrier.speed, stale: false }) === "moving";
}

export function pickTrain(unitId: string, pool: Observed[], ctx: TrainPickContext): Observed | null {
  let best: { o: Observed; s: number; h: number } | null = null;
  for (const o of pool) {
    if (!isTrain(o) || ctx.taken.has(o.key)) continue;
    if (ctx.now - o.lastSeen > STALE_AFTER_MS) continue;
    const c = o.carrier;
    let s = 0;
    if (isTrainMoving(o)) s += 3;
    if (c.lineRef) s += 2;
    if (c.origin && c.destination && c.origin !== c.destination) s += 1;
    if (c.delaySec == null) s -= 1;
    const perLine = c.lineRef ? (ctx.lineCounts.get(c.lineRef) ?? 0) : 0;
    if (perLine >= 2) s -= 5;
    const h = fnv1a(`${unitId}:${o.key}`);
    if (!best || s > best.s || (s === best.s && h < best.h)) best = { o, s, h };
  }
  return best?.o ?? null;
}
