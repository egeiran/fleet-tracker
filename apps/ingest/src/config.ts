import { HOME_BOUNDS, type Bbox } from "@vakt/domain";

export interface BarentsWatchConfig {
  clientId: string;
  clientSecret: string;
}

export interface Config {
  port: number;
  dbPath: string;
  corsOrigins: string[];
  barentswatch: BarentsWatchConfig | null;
  enturClientName: string;
  fleet: { sea: number; rail: number; road: number };
  logLevel: "debug" | "info" | "warn" | "error";
  bbox: Bbox;
  version: string;
}

function int(v: string | undefined, fallback: number, min = 1): number {
  if (v == null || v.trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
}

/** Reads env once. Canonical names first, then the legacy names used in early .env files. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const clientId = env.BARENTSWATCH_CLIENT_ID?.trim() || env.AIS_CLIENT_ID?.trim() || "";
  const clientSecret = env.BARENTSWATCH_CLIENT_SECRET?.trim() || env.CLIENT_SECRET?.trim() || "";
  const level = env.LOG_LEVEL as Config["logLevel"] | undefined;
  return {
    port: int(env.PORT, 8080),
    dbPath: env.DB_PATH?.trim() || "./data/ingest.sqlite",
    corsOrigins: (env.CORS_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    barentswatch: clientId && clientSecret ? { clientId, clientSecret } : null,
    enturClientName: env.ENTUR_CLIENT_NAME?.trim() || "vakt-fleetmap",
    fleet: { sea: int(env.FLEET_SEA, 30, 0), rail: int(env.FLEET_RAIL, 15, 0), road: int(env.FLEET_ROAD, 15, 0) },
    logLevel: level && ["debug", "info", "warn", "error"].includes(level) ? level : "info",
    bbox: HOME_BOUNDS,
    version: env.npm_package_version ?? "0.1.0",
  };
}

export const SEA_SHIP_TYPES = Array.from({ length: 30 }, (_, i) => 60 + i);
export const BW_TOKEN_URL = "https://id.barentswatch.no/connect/token";
export const BW_LIVE_URL = "https://live.ais.barentswatch.no";
export const BW_HISTORIC_URL = "https://historic.ais.barentswatch.no";
export const ENTUR_GRAPHQL_URL = "https://api.entur.io/realtime/v2/vehicles/graphql";

export const TIMING = {
  enturPollMs: 15_000,
  heartbeatMs: 15_000,
  streamWatchdogMs: 90_000,
  streamSinceFlushMs: 30_000,
  historySpacingMs: 300,
  pruneEveryMs: 10 * 60_000,
  stalenessEveryMs: 60_000,
  rebalanceEveryMs: 5 * 60_000,
  dbFlushMs: 5_000,
  seaSilentMs: 6 * 3_600_000,
  railSilentMs: 30 * 60_000,
  keepMs: 25 * 3_600_000,
} as const;
