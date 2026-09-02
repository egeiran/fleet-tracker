import { DEFAULT_SETTINGS, SETTINGS_LIMITS } from "./constants";
import type { ReticleMode, Settings, TrailMode } from "./types";

const TRAILS_TO_PARAM: Record<TrailMode, string> = { "fra zoom": "zoom", valgt: "sel", alle: "all", av: "off" };
const PARAM_TO_TRAILS: Record<string, TrailMode> = { zoom: "fra zoom", sel: "valgt", all: "alle", off: "av" };
const RETICLES: ReticleMode[] = ["presisjon", "minimal", "av"];

function clampStep(v: number, lim: { min: number; max: number; step: number }): number {
  const c = Math.max(lim.min, Math.min(lim.max, v));
  return Math.round((c - lim.min) / lim.step) * lim.step + lim.min;
}

function bool(v: string | null | undefined): boolean | undefined {
  if (v == null) return undefined;
  if (v === "1" || v === "true" || v === "on") return true;
  if (v === "0" || v === "false" || v === "off") return false;
  return undefined;
}

type Getter = (key: string) => string | null | undefined;

/** Parse settings from URL params (or any key→string source); invalid values fall back to `base`. */
export function parseSettings(get: Getter, base: Settings = DEFAULT_SETTINGS): Settings {
  const out: Settings = { ...base };
  const src = get("src");
  if (src === "mock" || src === "live") out.source = src;
  const reticle = get("reticle");
  if (reticle && (RETICLES as string[]).includes(reticle)) out.reticle = reticle as ReticleMode;
  const wake = bool(get("wake"));
  if (wake !== undefined) out.wake = wake;
  const cluster = bool(get("cluster"));
  if (cluster !== undefined) out.clustering = cluster;
  const px = Number(get("clusterPx"));
  if (get("clusterPx") != null && Number.isFinite(px)) out.clusterPx = clampStep(px, SETTINGS_LIMITS.clusterPx);
  const trails = get("trails");
  if (trails && PARAM_TO_TRAILS[trails]) out.trails = PARAM_TO_TRAILS[trails]!;
  const fleet = Number(get("fleet"));
  if (get("fleet") != null && Number.isFinite(fleet)) out.fleetSize = clampStep(fleet, SETTINGS_LIMITS.fleetSize);
  return out;
}

/** Serialize only the values that differ from the defaults. */
export function serializeSettings(s: Settings): Record<string, string> {
  const out: Record<string, string> = {};
  if (s.source !== DEFAULT_SETTINGS.source) out.src = s.source;
  if (s.reticle !== DEFAULT_SETTINGS.reticle) out.reticle = s.reticle;
  if (s.wake !== DEFAULT_SETTINGS.wake) out.wake = s.wake ? "1" : "0";
  if (s.clustering !== DEFAULT_SETTINGS.clustering) out.cluster = s.clustering ? "1" : "0";
  if (s.clusterPx !== DEFAULT_SETTINGS.clusterPx) out.clusterPx = String(s.clusterPx);
  if (s.trails !== DEFAULT_SETTINGS.trails) out.trails = TRAILS_TO_PARAM[s.trails];
  if (s.fleetSize !== DEFAULT_SETTINGS.fleetSize) out.fleet = String(s.fleetSize);
  return out;
}

/** Validate an object read from storage. */
export function coerceSettings(raw: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  if (!raw || typeof raw !== "object") return { ...base };
  const r = raw as Record<string, unknown>;
  const get: Getter = (k) => {
    const map: Record<string, string> = {
      src: "source",
      reticle: "reticle",
      wake: "wake",
      cluster: "clustering",
      clusterPx: "clusterPx",
      trails: "trails",
      fleet: "fleetSize",
    };
    const v = r[map[k] ?? k];
    if (v === undefined || v === null) return null;
    if (k === "trails" && typeof v === "string") return TRAILS_TO_PARAM[v as TrailMode] ?? null;
    if (typeof v === "boolean") return v ? "1" : "0";
    return String(v);
  };
  return parseSettings(get, base);
}
