import { bearingDeg, compass8, haversineM } from "./geo";
import { DESTINATION_ALIASES, PORTS, SEA_AREAS, type Hub } from "./hubs";
import type { LngLat } from "./types";

const NOISE = new Set([
  "",
  "FORORDERS",
  "FORORDER",
  "ORDERS",
  "NA",
  "N/A",
  "UNKNOWN",
  "TBA",
  "TBN",
  "CH16",
  "CH16FORINF",
  "FISHFARMS",
  "FISHFARM",
  "SEA",
  "ATSEA",
  "OFFSHORE",
  "WORKINGAREA",
]);

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/Ø/g, "O")
    .replace(/Æ/g, "AE")
    .replace(/Å/g, "A")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * AIS destination is hand-typed free text ("TRONDHEIM", "NOTRD", "OSLO>KIEL", "FOR ORDERS").
 * Returns a normalized port name or undefined; never the raw text.
 */
export function normalizeDestination(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const upper = raw.toUpperCase().trim();
  if (!upper) return undefined;
  // Multi-leg strings: keep the last leg ("OSLO>KIEL" → KIEL, "ARSVAAGEN-MORTAVIKA" → MORTAVIKA).
  const legs = upper.split(/[>\-/]|<>|\bTO\b|\bVIA\b/).map((l) => l.trim()).filter(Boolean);
  const candidates = legs.length ? [legs[legs.length - 1]!, ...legs] : [upper];
  for (const cand of candidates) {
    const key = fold(cand);
    if (NOISE.has(key)) continue;
    const hit = DESTINATION_ALIASES[key];
    if (hit) return hit;
    // "NO BGO" / "NO.SVG" style: country prefix with separator.
    const m = /^(NO|SE|DK|DE|NL|BE)([A-Z]{3})$/.exec(key);
    if (m) {
      const loc = DESTINATION_ALIASES[key];
      if (loc) return loc;
    }
  }
  return undefined;
}

export function nearestPort(pos: LngLat, maxKm: number): { hub: Hub; km: number } | null {
  let best: { hub: Hub; km: number } | null = null;
  for (const hub of PORTS) {
    const km = haversineM(pos, hub.c) / 1000;
    if (km <= maxKm && (!best || km < best.km)) best = { hub, km };
  }
  return best;
}

export function seaArea(pos: LngLat): string | undefined {
  for (const a of SEA_AREAS) {
    const [[w, s], [e, n]] = a.bbox;
    if (pos[0] >= w && pos[0] <= e && pos[1] >= s && pos[1] <= n) return a.name;
  }
  return undefined;
}

export function bearingLabel(pos: LngLat): string {
  let best: { hub: Hub; km: number } | null = null;
  for (const hub of PORTS) {
    const km = haversineM(pos, hub.c) / 1000;
    if (!best || km < best.km) best = { hub, km };
  }
  if (!best) return "til havs";
  const dir = compass8(bearingDeg(best.hub.c, pos));
  return `${Math.round(best.km)} km ${dir} for ${best.hub.name}`;
}

export interface VesselPlaceInput {
  pos: LngLat;
  status: "moving" | "idle" | "alert";
  destination?: string;
  moored?: boolean;
  origin?: string;
}

/** Narrative place label for a vessel without reverse geocoding. */
export function vesselPlace(i: VesselPlaceInput): string {
  const near = nearestPort(i.pos, 35);
  if (i.status === "idle") {
    if (near) return `${near.hub.name} havn · ${i.moored ? "til kai" : "på reden"}`;
    const area = seaArea(i.pos);
    return area ? `${area} · ligger stille` : `${bearingLabel(i.pos)} · ligger stille`;
  }
  const to = i.destination ? ` → ${i.destination}` : "";
  const alert = i.status === "alert" ? " · avvik" : "";
  if (near && near.km <= 12) return `${near.hub.name} · underveis${to}${alert}`;
  const area = seaArea(i.pos);
  const from = i.origin ? `${i.origin} ` : "";
  if (area) return `${area} · underveis ${from}${to.trim()}${alert}`.replace(/\s+/g, " ");
  return `${bearingLabel(i.pos)} · underveis${to}${alert}`;
}

export interface TrainPlaceInput {
  pos: LngLat;
  status: "moving" | "idle" | "alert";
  publicCode?: string;
  lineName?: string;
  origin?: string;
  destination?: string;
}

export function trainPlace(i: TrainPlaceInput): string {
  const line = i.publicCode ?? i.lineName ?? "tog";
  const route =
    i.origin && i.destination
      ? `${i.origin} → ${i.destination}`
      : (i.lineName ?? i.destination ?? "");
  const near = nearestPort(i.pos, 25);
  const head = near ? `${near.hub.name} · ` : "";
  const tail = i.status === "idle" ? " · står stille" : i.status === "alert" ? " · avvik" : "";
  return `${head}tog ${line}${route ? ` · ${route}` : ""}${tail}`;
}
