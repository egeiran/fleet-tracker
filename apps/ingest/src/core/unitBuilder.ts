import {
  coverageOf,
  deriveTrainStatus,
  deriveVesselStatus,
  displacementM,
  formatClock,
  isStale,
  isStationaryNavStatus,
  nearestPort,
  seaArea,
  shipTypeInfo,
  simulate,
  trainPlace,
  vesselPlace,
  type Carrier,
  type LngLat,
  type Mode,
  type Status,
  type TrackPoint,
  type Unit,
} from "@vakt/domain";

export interface BuildInput {
  slot: number;
  unitId: string;
  mode: Mode;
  carrier: Carrier;
  track: TrackPoint[];
  assignedAt: number;
  now: number;
  prevStatus: Status | null;
}

function placeForPoint(p: LngLat): string {
  const near = nearestPort(p, 35);
  if (near) return `${near.hub.name}`;
  return seaArea(p) ?? "til havs";
}

/** Turns a slot + carrier + track into the wire `Unit`, with simulated sensors on top of real motion. */
export function buildLiveUnit(i: BuildInput): Unit {
  const { carrier, track, now } = i;
  const last = track[track.length - 1];
  const position: LngLat = last ? [last[0], last[1]] : [0, 0];
  const positionTs = last?.[2] ?? now;
  const lastSeen = carrier.kind === "mock" ? now : carrier.lastSeen;
  const stale = isStale(lastSeen, now);

  let base: "moving" | "idle";
  let carrierLabel: string;
  let origin: string | undefined;
  let destination: string | undefined;
  let moored = false;
  let tanker = false;
  let place: string;
  let heading: number | undefined;

  if (carrier.kind === "vessel") {
    base = deriveVesselStatus({
      sog: carrier.sog,
      navStatus: carrier.navStatus,
      displacement10minM: displacementM(track, 10 * 60_000),
      stale,
      prev: i.prevStatus === "alert" ? "moving" : i.prevStatus,
    });
    moored = isStationaryNavStatus(carrier.navStatus);
    tanker = shipTypeInfo(carrier.shipType).class === "tank";
    carrierLabel = `MS ${carrier.name}`;
    destination = carrier.destination;
    place = vesselPlace({ pos: position, status: base, destination, moored });
    heading = carrier.heading ?? carrier.cog;
  } else if (carrier.kind === "train") {
    base = deriveTrainStatus({ displacementM: displacementM(track, 2 * 60_000), speed: carrier.speed, stale });
    const line = carrier.publicCode ?? carrier.lineName ?? "";
    carrierLabel = `tog ${line}${carrier.origin && carrier.destination ? ` ${carrier.origin} → ${carrier.destination}` : ""}`.trim();
    origin = carrier.origin;
    destination = carrier.destination;
    place = trainPlace({ pos: position, status: base, publicCode: carrier.publicCode, lineName: carrier.lineName, origin, destination });
    heading = carrier.bearing;
  } else {
    base = "moving";
    carrierLabel = carrier.label;
    place = carrier.label;
  }

  const sim = simulate(i.unitId, {
    mode: i.mode,
    status: base,
    track,
    assignedAt: i.assignedAt || (track[0]?.[2] ?? now),
    now,
    carrierLabel,
    origin,
    destination,
    moored,
    tanker,
    placeForPoint,
  });

  if (sim.status === "alert" && !place.includes("avvik")) place = `${place} · avvik`;
  if (stale) place = `${place} · siste kontakt ${formatClock(lastSeen)}`;

  const cov = coverageOf(track);
  return {
    id: i.unitId,
    slot: i.slot,
    status: sim.status,
    mode: i.mode,
    source: carrier.kind === "vessel" ? "live" : carrier.kind === "train" ? "buffered" : "mock",
    stale,
    position,
    positionTs,
    heading,
    place,
    batt: sim.batt,
    temp: sim.temp,
    door: sim.door,
    booking: sim.booking,
    cargoLabel: sim.cargoLabel,
    sensors: "simulert",
    events: sim.events,
    carrier,
    track,
    trackCoverageFrom: cov.from,
    trackCoverageTo: cov.to,
  };
}
