import type { Settings } from "./types";

/** Design start view: Norway down to the Benelux coast. */
export const HOME_BOUNDS: [[number, number], [number, number]] = [
  [2.6, 51.0],
  [16.4, 64.2],
];

export const DAY_MS = 86_400_000;
export const TRAIL_MIN_ZOOM = 5.4;
export const WAKE_LEN = { normal: 0.05, playing: 0.11 } as const;
export const SELECT_ZOOM = 6.4;
export const CLUSTER_MAX_ZOOM = 9.6;
export const LOCK_RADIUS = { unit: 110, cluster: 130 } as const;
export const LOW_BATTERY = 50;
export const PROTOTYPE_SEED = 20260902;

export const DEFAULT_SETTINGS: Settings = {
  source: "mock",
  reticle: "presisjon",
  wake: true,
  clustering: true,
  clusterPx: 48,
  trails: "fra zoom",
  fleetSize: 60,
};

export const SETTINGS_LIMITS = {
  clusterPx: { min: 28, max: 96, step: 4 },
  fleetSize: { min: 12, max: 320, step: 4 },
} as const;
