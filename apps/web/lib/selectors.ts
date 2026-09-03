import { applyFilters, countsByStatus, sortUnits, type StatusCounts, type Unit } from "@vakt/domain";
import type { FleetState } from "./fleetStore";

/** Tiny memo helper: recompute only when the listed inputs change identity. */
function memo<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let lastArgs: A | null = null;
  let lastResult: R;
  return (...args: A) => {
    if (lastArgs && lastArgs.length === args.length && lastArgs.every((v, i) => v === args[i])) return lastResult;
    lastArgs = args;
    lastResult = fn(...args);
    return lastResult;
  };
}

const visibleSorted = memo((fleet: Unit[], filters: FleetState["filters"]) => sortUnits(applyFilters(fleet, filters)));
export const selectVisibleSorted = (s: FleetState): Unit[] => visibleSorted(s.fleet, s.filters);

const counts = memo((fleet: Unit[]): StatusCounts => countsByStatus(fleet));
export const selectCounts = (s: FleetState): StatusCounts => counts(s.fleet);

export const selectShownCount = (s: FleetState): number => selectVisibleSorted(s).length;
export const selectSelectedUnit = (s: FleetState): Unit | null => (s.sel ? (s.byId.get(s.sel) ?? null) : null);
export const selectEmpty = (s: FleetState): boolean => s.fleet.length > 0 && selectVisibleSorted(s).length === 0;
export const selectReticleEnabled = (s: FleetState): boolean =>
  s.settings.reticle !== "av" && !s.reducedMotion && s.inputModality === "pointer";
export const selectContentLeft = (s: FleetState): number => (s.rail ? 308 : 14);
export const selectCtrlTop = (s: FleetState): number => (s.rail ? 68 : 112);
