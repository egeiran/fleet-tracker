import { coordLabel } from "./format";
import { seaArea } from "./place";
import { fnv1a, mulberry32 } from "./prng";
import { formatClock } from "./time";
import type { LngLat, Mode, Status, TrackPoint, UnitEvent } from "./types";

export const CARGO_LABELS = [
  "stykkgods",
  "kjøl 2–8 °C",
  "papirruller",
  "byggevarer",
  "sjømat",
  "maskindeler",
  "møbler",
  "kjemi UN1263",
  "tørrlast",
  "batterier",
] as const;

export interface SimContext {
  mode: Mode;
  /** Data-derived status; the simulation may upgrade it to `alert`. */
  status: "moving" | "idle";
  track: TrackPoint[];
  assignedAt: number;
  now: number;
  /** "MS NORDKAPP" / "tog R31 Oslo S → Bergen" for the boarding event. */
  carrierLabel: string;
  origin?: string;
  destination?: string;
  moored?: boolean;
  /** Tankers get tank-container cargo; everything else draws from the list. */
  tanker?: boolean;
  placeForPoint: (p: LngLat) => string;
  timeZone?: string;
}

export interface SimResult {
  status: Status;
  batt: number;
  temp: number;
  door: "lukket" | "åpen";
  booking: string;
  cargoLabel: string;
  events: UnitEvent[];
}

const HOUR = 3_600_000;

/**
 * Deterministic sensor and event simulation for a unit riding a real carrier. Everything
 * random is drawn from a generator seeded by the unit id, so a unit keeps its personality;
 * everything time-based is anchored to real track timestamps.
 */
export function simulate(unitId: string, ctx: SimContext): SimResult {
  const r = mulberry32(fnv1a(unitId));
  const tz = ctx.timeZone ?? "Europe/Oslo";
  const clock = (ts: number) => formatClock(ts, tz);
  const track = ctx.track;
  const n = track.length;

  const alertRoll = r();
  const battLow = r() < 0.09;
  const battBase = battLow ? 22 + Math.floor(r() * 26) : 82 + Math.floor(r() * 18);
  const cargoIdx = Math.floor(r() * CARGO_LABELS.length);
  const bookingRoll = r();
  const bookingNum = 40100 + Math.floor(r() * 900);
  const doorAlert = r() < 0.5;
  const shockG = 3 + Math.floor(r() * 6);
  const alertFrac = 0.6 + 0.3 * r();
  const tempJitter = Math.floor(r() * 3) - 1;

  const cargoLabel = ctx.tanker
    ? cargoIdx % 2 === 0
      ? "kjemi UN1263"
      : "tørrlast"
    : CARGO_LABELS[cargoIdx]!;
  const hoursAssigned = Math.max(0, (ctx.now - ctx.assignedAt) / HOUR);
  const batt = Math.max(5, Math.round(battBase - hoursAssigned * 0.25));
  const hour = new Date(ctx.now).getUTCHours();
  const wobble = Math.round(Math.sin((hour / 24) * Math.PI * 2) * 1);
  const temp = cargoLabel.startsWith("kjøl") ? 4 + wobble : 6 + tempJitter * 4 + wobble;

  const isAlert = alertRoll < 0.08 && n >= 2;
  const status: Status = isAlert ? "alert" : ctx.status;
  const booking =
    status === "idle" && bookingRoll < 0.6 ? "ubooket" : `BK-${bookingNum}`;

  const events: UnitEvent[] = [];
  const push = (e: Omit<UnitEvent, "time">) => events.push({ ...e, time: clock(e.ts) });

  if (n > 0) {
    const first = track[0]!;
    const last = track[n - 1]!;
    const firstPos: LngLat = [first[0], first[1]];
    const lastPos: LngLat = [last[0], last[1]];
    const modeLabel = ctx.mode;

    if (ctx.mode === "bane") {
      push({
        ts: ctx.assignedAt,
        label: `Lastet på ${ctx.carrierLabel}${ctx.origin ? ` · ${ctx.origin}` : ""}`,
        place: ctx.placeForPoint(firstPos),
        tone: "ok",
        coord: firstPos,
        simulated: false,
      });
    } else {
      push({
        ts: first[2],
        label: "Gate ut · bekreftet av enheten",
        place: ctx.placeForPoint(firstPos),
        tone: "ok",
        coord: firstPos,
        simulated: true,
      });
      push({
        ts: Math.max(first[2], ctx.assignedAt),
        label: `Om bord ${ctx.carrierLabel}`,
        place: ctx.origin ?? ctx.placeForPoint(firstPos),
        tone: "muted",
        simulated: false,
      });
    }

    if (ctx.status === "moving" && n >= 2) {
      const mid = track[Math.floor((n - 1) / 2)]!;
      const midPos: LngLat = [mid[0], mid[1]];
      const area = seaArea(midPos);
      push({
        ts: mid[2],
        label: `Underveis · ${modeLabel} · dør lukket`,
        place: `${area ? `${area} · ` : ""}${coordLabel(midPos)}`,
        tone: "muted",
        coord: midPos,
        simulated: true,
      });
    } else if (ctx.status === "idle") {
      if (ctx.moored) {
        push({
          ts: last[2],
          label: `Ligger til kai${ctx.destination ? ` · ${ctx.destination}` : ""}`,
          place: ctx.placeForPoint(lastPos),
          tone: "muted",
          coord: lastPos,
          simulated: false,
        });
      }
      if (batt < 50) {
        push({
          ts: last[2],
          label: "Batteri under flåtemedian",
          place: ctx.placeForPoint(lastPos),
          tone: "warn",
          coord: lastPos,
          simulated: true,
        });
      } else if (booking === "ubooket") {
        push({
          ts: last[2],
          label: "Bekreftet tom · klar for ny booking",
          place: ctx.placeForPoint(lastPos),
          tone: "ok",
          coord: lastPos,
          simulated: true,
        });
      }
    }

    if (isAlert) {
      const idx = Math.min(n - 1, Math.max(1, Math.floor(alertFrac * (n - 1))));
      const p = track[idx]!;
      const pos: LngLat = [p[0], p[1]];
      push({
        ts: p[2],
        label: doorAlert ? "Dør åpnet utenfor godkjent sone" : `Støt ${shockG},1 g registrert`,
        place: `${ctx.placeForPoint(pos)} · ${coordLabel(pos)}`,
        tone: "alert",
        coord: pos,
        simulated: true,
      });
      push({
        ts: p[2] + 2 * 60_000,
        label: "Varsel sendt til driftssenteret",
        place: "driftssenteret",
        tone: "warn",
        simulated: true,
      });
    }
  }

  events.sort((a, b) => b.ts - a.ts);
  return {
    status,
    batt,
    temp,
    door: isAlert && doorAlert ? "åpen" : "lukket",
    booking,
    cargoLabel,
    events,
  };
}
