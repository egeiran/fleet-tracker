import { LOW_BATTERY } from "./constants";
import type { FilterState, Status, Unit } from "./types";

export const EMPTY_FILTERS: FilterState = { status: "all", modes: [], lowBatt: false, q: "" };

export function searchText(u: Unit): string {
  const carrier =
    u.carrier.kind === "vessel"
      ? `${u.carrier.name} ${u.carrier.mmsi}`
      : u.carrier.kind === "train"
        ? `${u.carrier.publicCode ?? ""} ${u.carrier.lineName ?? ""}`
        : "";
  return `${u.id} ${u.place} ${u.mode} ${u.booking} ${u.cargoLabel} ${carrier}`.toLowerCase();
}

export function matches(u: Unit, f: FilterState): boolean {
  if (f.status !== "all" && u.status !== f.status) return false;
  if (f.modes.length && !f.modes.includes(u.mode)) return false;
  if (f.lowBatt && u.batt >= LOW_BATTERY) return false;
  const q = f.q.trim().toLowerCase();
  return !q || searchText(u).includes(q);
}

export function applyFilters(units: Unit[], f: FilterState): Unit[] {
  return units.filter((u) => matches(u, f));
}

export interface StatusCounts {
  all: number;
  moving: number;
  idle: number;
  alert: number;
}

export function countsByStatus(units: Unit[]): StatusCounts {
  const c: StatusCounts = { all: units.length, moving: 0, idle: 0, alert: 0 };
  for (const u of units) c[u.status as Status]++;
  return c;
}
