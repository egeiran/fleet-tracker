import {
  CARGO_LABELS,
  DAY_MS,
  fracMock,
  HUBS,
  mulberry32,
  posAt,
  PROTOTYPE_SEED,
  type CarrierMock,
  type LngLat,
  type Mode,
  type Status,
  type TrackPoint,
  type Unit,
  type UnitEvent,
} from "@vakt/domain";
import { HERO, type HeroEvent, type HeroUnit } from "./hero";
import { LANES, type Lane } from "./lanes";

/** The prototype's frozen "now": 2026-09-02 09:20 UTC. */
export const MOCK_NOW = Date.UTC(2026, 8, 2, 9, 20, 0);
export const MOCK_WINDOW = { from: MOCK_NOW - DAY_MS, to: MOCK_NOW };

export interface BuildFleetOptions {
  size?: number;
  seed?: number;
}

/** Synthetic route between two hubs with three bowed control points, exactly as in the prototype. */
export function lanePath(a: string, b: string, r: () => number): LngLat[] {
  const A = HUBS[a]!.c;
  const B = HUBS[b]!.c;
  if (a === b) return [[A[0] + (r() - 0.5) * 0.14, A[1] + (r() - 0.5) * 0.08]];
  const out: LngLat[] = [A];
  const n = 3;
  const dx = B[0] - A[0];
  const dy = B[1] - A[1];
  for (let i = 1; i <= n; i++) {
    const f = i / (n + 1);
    const bow = Math.sin(f * Math.PI) * (r() - 0.5) * 0.9;
    out.push([A[0] + dx * f - dy * bow * 0.35, A[1] + dy * f + dx * bow * 0.22]);
  }
  out.push(B);
  return out;
}

/** Sample the prototype's motion into a timestamped track across the 24 h window. */
export function sampleTrack(path: LngLat[], progress: number, steps = 24): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 100;
    const p = posAt(path, fracMock(progress, t));
    out.push([p[0], p[1], MOCK_WINDOW.from + (DAY_MS * i) / steps]);
  }
  return out;
}

const HHMM = /^(\d{2}):(\d{2})$/;
const REL_H = /^−(\d+)t$/;
const DAY = /^dag (\d+)$/;

/** Turn the prototype's display-only time strings into plausible timestamps before MOCK_NOW. */
function eventTs(time: string, index: number): number {
  const m = HHMM.exec(time);
  if (m) {
    const h = Number(m[1]);
    const mm = Number(m[2]);
    const sameDay = Date.UTC(2026, 8, 2, h, mm);
    return sameDay <= MOCK_NOW ? sameDay : sameDay - DAY_MS;
  }
  const rel = REL_H.exec(time);
  if (rel) return MOCK_NOW - Number(rel[1]) * 3_600_000;
  const d = DAY.exec(time);
  if (d) return MOCK_NOW - Number(d[1]) * DAY_MS;
  return MOCK_NOW - (index + 1) * 3_600_000;
}

function toEvents(list: HeroEvent[]): UnitEvent[] {
  return list.map((e, i) => ({
    ts: eventTs(e.time, i),
    time: e.time,
    label: e.label,
    place: e.place,
    tone: e.tone,
    simulated: true,
  }));
}

function laneLabel(lane: [string, string], mode: Mode): string {
  const a = HUBS[lane[0]]!.name;
  const b = HUBS[lane[1]]!.name;
  const via = mode === "vei" ? "E-vei" : mode === "bane" ? "jernbane" : "sjølinje";
  return lane[0] === lane[1] ? `${a} · ${via}` : `${a} → ${b} · ${via}`;
}

interface Draft {
  id: string;
  status: Status;
  mode: Mode;
  lane: [string, string];
  path: LngLat[];
  p: number;
  batt: number;
  temp: number;
  booking: string;
  cargo: string;
  place: string;
  events: UnitEvent[];
}

function toUnit(d: Draft, slot: number): Unit {
  const frac = fracMock(d.p, 100);
  const pos = posAt(d.path, frac);
  const carrier: CarrierMock = { kind: "mock", lane: d.lane, label: laneLabel(d.lane, d.mode) };
  return {
    id: d.id,
    slot,
    status: d.status,
    mode: d.mode,
    source: "mock",
    stale: false,
    position: pos,
    positionTs: MOCK_NOW,
    place: d.place,
    batt: d.batt,
    temp: d.temp,
    door: d.status === "alert" ? "åpen" : "lukket",
    booking: d.booking,
    cargoLabel: d.cargo,
    sensors: "simulert",
    events: d.events,
    carrier,
    track: sampleTrack(d.path, d.p),
    trackCoverageFrom: MOCK_WINDOW.from,
    trackCoverageTo: MOCK_WINDOW.to,
    path: d.path,
    progress: d.p,
  };
}

function heroDraft(h: HeroUnit, i: number): Draft {
  return {
    id: h.id,
    status: h.status,
    mode: h.mode,
    lane: h.lane,
    path: lanePath(h.lane[0], h.lane[1], mulberry32(9000 + i)),
    p: h.p,
    batt: h.batt,
    temp: h.temp,
    booking: h.booking,
    cargo: h.cargo,
    place: h.place,
    events: toEvents(h.events),
  };
}

/**
 * Port of the prototype's `buildFleet`: same seed → same lanes, statuses, batteries and places
 * (only the id prefix differs). Hero units come first.
 */
export function buildFleet(opts: BuildFleetOptions = {}): Unit[] {
  const size = Math.max(HERO.length + 4, opts.size ?? 60);
  const r = mulberry32(opts.seed ?? PROTOTYPE_SEED);
  const drafts: Draft[] = HERO.map(heroDraft);
  for (let i = drafts.length; i < size; i++) {
    const lane: Lane = LANES[Math.floor(r() * LANES.length)]!;
    const roll = r();
    const status: Status = roll < 0.08 ? "alert" : roll < 0.62 ? "moving" : "idle";
    const from = lane[0];
    const to = status === "idle" ? lane[0] : lane[1];
    const path = lanePath(from, to, mulberry32(4000 + i * 13));
    const p = status === "idle" ? 1 : 0.12 + r() * 0.8;
    const batt = r() < 0.09 ? 22 + Math.floor(r() * 26) : 82 + Math.floor(r() * 18);
    const temp = -2 + Math.floor(r() * 18);
    const dest = HUBS[lane[1]]!.name;
    const orig = HUBS[lane[0]]!.name;
    const id = "VKT-" + String(1000 + Math.floor(r() * 8900));
    const cargo = CARGO_LABELS[Math.floor(r() * CARGO_LABELS.length)]!;
    const place =
      status === "idle"
        ? HUBS[from]!.name + (r() < 0.5 ? " depot · ledig" : " terminal · venter på booking")
        : `${orig} → ${dest}${status === "alert" ? " · avvik" : ""}`;
    const hh = String(Math.floor(r() * 24)).padStart(2, "0");
    const mm = String(Math.floor(r() * 60)).padStart(2, "0");
    const raw: HeroEvent[] =
      status === "alert"
        ? [
            {
              time: `${hh}:${mm}`,
              label: r() < 0.5 ? "Dør åpnet utenfor godkjent sone" : `Støt ${3 + Math.floor(r() * 6)},1 g registrert`,
              place: `${orig} → ${dest}`,
              tone: "alert",
            },
            { time: "−1t", label: "Underveis · dør lukket", place: orig, tone: "muted" },
          ]
        : status === "moving"
          ? [
              { time: `${hh}:${mm}`, label: `Underveis · ${lane[2]} · dør lukket`, place: `${orig} → ${dest}`, tone: "muted" },
              { time: "−6t", label: "Gate ut · bekreftet av enheten", place: `${orig} terminal`, tone: "ok" },
            ]
          : [
              {
                time: `${hh}:${mm}`,
                label: batt < 50 ? "Batteri under flåtemedian" : "Bekreftet tom · klar for ny booking",
                place: HUBS[from]!.name,
                tone: batt < 50 ? "warn" : "ok",
              },
            ];
    drafts.push({
      id,
      status,
      mode: lane[2],
      lane: [from, to],
      path,
      p,
      batt,
      temp,
      booking: status === "idle" && r() < 0.6 ? "ubooket" : `BK-${40100 + Math.floor(r() * 900)}`,
      cargo,
      place,
      events: toEvents(raw),
    });
  }
  const seen = new Set<string>();
  const unique = drafts.filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));
  return unique.map(toUnit);
}
