import { PROTOTYPE_SEED } from "./constants";
import { mulberry32 } from "./prng";

export const ID_PREFIX = "VKT-";

/**
 * Stable unit id for a fleet slot. Deterministic across restarts and deployments so share links
 * keep working; slots that would collide skip forward to the next free number.
 */
export function unitIdForSlot(slot: number): string {
  const taken = new Set<string>();
  let id = "";
  for (let s = 0; s <= slot; s++) {
    const r = mulberry32(PROTOTYPE_SEED + s * 7919);
    do {
      id = ID_PREFIX + String(1000 + Math.floor(r() * 8900));
    } while (taken.has(id));
    taken.add(id);
  }
  return id;
}

export function unitIdsForSlots(count: number): string[] {
  const out: string[] = [];
  const taken = new Set<string>();
  for (let s = 0; s < count; s++) {
    const r = mulberry32(PROTOTYPE_SEED + s * 7919);
    let id: string;
    do {
      id = ID_PREFIX + String(1000 + Math.floor(r() * 8900));
    } while (taken.has(id));
    taken.add(id);
    out.push(id);
  }
  return out;
}
