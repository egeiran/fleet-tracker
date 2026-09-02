import { navStatusLabel } from "./navStatus";
import { normalizeDestination } from "./place";
import { shipTypeInfo } from "./shipTypes";
import type { CarrierTrain, CarrierVessel, TrackPoint } from "./types";

/** BarentsWatch `AisComboFull`/`AisComboSimple` as received (all fields optional in practice). */
export interface AisMessage {
  mmsi: number;
  msgtime: string;
  latitude: number;
  longitude: number;
  courseOverGround?: number | null;
  speedOverGround?: number | null;
  trueHeading?: number | null;
  navigationalStatus?: number | null;
  name?: string | null;
  shipType?: number | null;
  imoNumber?: number | null;
  callSign?: string | null;
  destination?: string | null;
  eta?: string | null;
  shipLength?: number | null;
  shipWidth?: number | null;
}

export function isAisMessage(x: unknown): x is AisMessage {
  if (!x || typeof x !== "object") return false;
  const m = x as Record<string, unknown>;
  return (
    typeof m.mmsi === "number" &&
    typeof m.msgtime === "string" &&
    typeof m.latitude === "number" &&
    typeof m.longitude === "number" &&
    Number.isFinite(m.latitude) &&
    Number.isFinite(m.longitude)
  );
}

export function aisTimestamp(m: AisMessage): number {
  const t = Date.parse(m.msgtime);
  return Number.isFinite(t) ? t : NaN;
}

export function aisToPoint(m: AisMessage): TrackPoint | null {
  const ts = aisTimestamp(m);
  if (!Number.isFinite(ts)) return null;
  return [round5(m.longitude), round5(m.latitude), ts];
}

export function round5(v: number): number {
  return Math.round(v * 1e5) / 1e5;
}

function clean(s: string | null | undefined): string | undefined {
  const t = s?.trim();
  return t ? t : undefined;
}

/** Heading 511 and COG 360 mean "not available" in AIS. */
function heading(h: number | null | undefined): number | undefined {
  return h == null || h >= 360 ? undefined : h;
}

export function aisToCarrier(m: AisMessage, prev?: CarrierVessel): CarrierVessel {
  const ts = aisTimestamp(m);
  const name = clean(m.name) ?? prev?.name ?? `MMSI ${m.mmsi}`;
  const shipType = m.shipType ?? prev?.shipType ?? 0;
  const destinationRaw = clean(m.destination) ?? prev?.destinationRaw;
  return {
    kind: "vessel",
    mmsi: m.mmsi,
    name,
    imo: m.imoNumber ?? prev?.imo,
    callSign: clean(m.callSign) ?? prev?.callSign,
    shipType,
    shipTypeLabel: shipTypeInfo(shipType).label,
    lengthM: m.shipLength ?? prev?.lengthM,
    destinationRaw,
    destination: normalizeDestination(destinationRaw),
    eta: clean(m.eta) ?? prev?.eta,
    navStatus: m.navigationalStatus ?? prev?.navStatus,
    navStatusLabel: navStatusLabel(m.navigationalStatus ?? prev?.navStatus),
    sog: m.speedOverGround ?? undefined,
    cog: m.courseOverGround == null || m.courseOverGround >= 360 ? undefined : m.courseOverGround,
    heading: heading(m.trueHeading),
    lastSeen: Number.isFinite(ts) ? ts : Date.now(),
  };
}

/** Entur `VehicleUpdate` subset. */
export interface EnturVehicle {
  vehicleId: string;
  mode?: string | null;
  codespace?: { codespaceId: string } | null;
  operator?: { operatorRef: string; name?: string | null } | null;
  line?: { lineRef?: string | null; lineName?: string | null; publicCode?: string | null } | null;
  location?: { latitude: number; longitude: number } | null;
  lastUpdated?: string | null;
  lastUpdatedEpochSecond?: number | null;
  speed?: number | null;
  bearing?: number | null;
  delay?: number | null;
  originName?: string | null;
  destinationName?: string | null;
  serviceJourney?: { id: string } | null;
}

const OPERATORS: Record<string, string> = {
  VYG: "Vy",
  VYT: "Vy Tog",
  GOA: "Go-Ahead Nordic",
  SJN: "SJ Nord",
  FLT: "Flytoget",
  NSB: "Vy",
  VYB: "Vy",
  ATB: "AtB",
  RUT: "Ruter",
};

export function enturOperatorLabel(codespace: string): string {
  return OPERATORS[codespace] ?? codespace;
}

export function enturTimestamp(v: EnturVehicle): number {
  if (v.lastUpdatedEpochSecond) return v.lastUpdatedEpochSecond * 1000;
  const t = v.lastUpdated ? Date.parse(v.lastUpdated) : NaN;
  return Number.isFinite(t) ? t : Date.now();
}

export function enturToPoint(v: EnturVehicle): TrackPoint | null {
  const loc = v.location;
  if (!loc || !Number.isFinite(loc.latitude) || !Number.isFinite(loc.longitude)) return null;
  return [round5(loc.longitude), round5(loc.latitude), enturTimestamp(v)];
}

export function enturToCarrier(v: EnturVehicle): CarrierTrain {
  const codespace = v.codespace?.codespaceId ?? v.vehicleId.split(":")[0] ?? "?";
  return {
    kind: "train",
    vehicleId: v.vehicleId,
    codespace,
    operatorLabel: clean(v.operator?.name) ?? enturOperatorLabel(codespace),
    lineRef: clean(v.line?.lineRef),
    publicCode: clean(v.line?.publicCode),
    lineName: clean(v.line?.lineName),
    origin: clean(v.originName),
    destination: clean(v.destinationName),
    speed: v.speed ?? undefined,
    bearing: v.bearing ?? undefined,
    delaySec: v.delay ?? undefined,
    serviceJourneyId: v.serviceJourney?.id,
    lastSeen: enturTimestamp(v),
  };
}

/** Entur train ids embed the date ("230-2026-09-02"); key carriers by codespace + id. */
export function trainCarrierKey(v: { codespace: string; vehicleId: string }): string {
  return `entur:${v.codespace}:${v.vehicleId}`;
}

export function vesselCarrierKey(mmsi: number): string {
  return `ais:${mmsi}`;
}
