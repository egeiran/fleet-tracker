import { fracMock, posAt, type LngLat, type Unit } from "@vakt/domain";
import { buildFleet, MOCK_WINDOW } from "@vakt/mock";
import type { FleetProvider, FleetSnapshotView, ProviderStatus } from "./types";

const MOCK_COVERAGE = {
  sea: { state: "mock" as const, carriers: 0, assigned: 0 },
  rail: { state: "mock" as const, carriers: 0, assigned: 0 },
  road: { state: "mock" as const, carriers: 0, assigned: 0 },
};

/** The design prototype's seeded fleet, generated in the browser. */
export function createMockProvider(fleetSize: number): FleetProvider {
  let snap: FleetSnapshotView | null = null;
  const subs = new Set<(s: FleetSnapshotView) => void>();
  const statusSubs = new Set<(s: ProviderStatus, at: number | null) => void>();
  return {
    kind: "mock",
    clockTimeZone: "UTC",
    start() {
      if (snap) return;
      snap = { units: buildFleet({ size: fleetSize }), window: MOCK_WINDOW, coverage: MOCK_COVERAGE, attribution: ["mockdata"] };
      for (const cb of subs) cb(snap);
      for (const cb of statusSubs) cb("mock", null);
    },
    stop() {
      subs.clear();
      statusSubs.clear();
    },
    getSnapshot: () => snap,
    subscribe(cb) {
      subs.add(cb);
      if (snap) cb(snap);
      return () => subs.delete(cb);
    },
    onStatus(cb) {
      statusSubs.add(cb);
      cb("mock", null);
      return () => statusSubs.delete(cb);
    },
    fracAt: (u, t) => fracMock(u.progress ?? 1, t),
    positionAt(u, t): LngLat {
      return posAt(this.pathOf(u), this.fracAt(u, t));
    },
    pathOf: (u: Unit) => u.path ?? [u.position],
    coverageStartT: () => 0,
  };
}
