import type { Coverage, LngLat, TimeWindow, Unit } from "@vakt/domain";

export type ProviderStatus = "connecting" | "live" | "stale" | "offline" | "unavailable" | "mock";

export interface FleetSnapshotView {
  units: Unit[];
  window: TimeWindow;
  coverage: Coverage | null;
  attribution: string[];
}

export interface FleetProvider {
  readonly kind: "mock" | "live";
  readonly clockTimeZone: string;
  start(): void;
  stop(): void;
  getSnapshot(): FleetSnapshotView | null;
  subscribe(cb: (snap: FleetSnapshotView) => void): () => void;
  onStatus(cb: (status: ProviderStatus, lastUpdate: number | null) => void): () => void;
  /** Fraction (0–1) along `pathOf(unit)` at slider position t (0–100). */
  fracAt(unit: Unit, t: number): number;
  positionAt(unit: Unit, t: number): LngLat;
  pathOf(unit: Unit): LngLat[];
  /** Fraction of the slider before which the unit has no data (0 = full coverage). */
  coverageStartT(unit: Unit): number;
}
