import type { Status, Unit } from "./types";

const ORDER: Record<Status, number> = { alert: 0, moving: 1, idle: 2 };

/** Alerts first, then moving, then idle; alphabetical within each group. */
export function sortUnits(units: Unit[]): Unit[] {
  return [...units].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.id.localeCompare(b.id));
}
