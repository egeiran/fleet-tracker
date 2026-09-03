import { unitIdsForSlots, type Mode } from "@vakt/domain";
import type { AssignmentsRepo } from "../db/repos";

export interface Slot {
  slot: number;
  unitId: string;
  mode: Mode;
  carrierKey: string | null;
  assignedAt: number;
}

/** Fixed slots with stable unit ids; assignments are persisted so restarts keep the same carriers. */
export class Fleet {
  readonly slots: Slot[] = [];
  private byUnit = new Map<string, Slot>();

  constructor(
    counts: { sea: number; rail: number; road: number },
    private repo: AssignmentsRepo,
  ) {
    const total = counts.sea + counts.rail + counts.road;
    const ids = unitIdsForSlots(total);
    for (let i = 0; i < total; i++) {
      const mode: Mode = i < counts.sea ? "sjø" : i < counts.sea + counts.rail ? "bane" : "vei";
      const s: Slot = { slot: i, unitId: ids[i]!, mode, carrierKey: null, assignedAt: 0 };
      this.slots.push(s);
      this.byUnit.set(s.unitId, s);
    }
  }

  get(unitId: string): Slot | undefined {
    return this.byUnit.get(unitId);
  }

  ofMode(mode: Mode): Slot[] {
    return this.slots.filter((s) => s.mode === mode);
  }

  empty(mode: Mode): Slot[] {
    return this.ofMode(mode).filter((s) => !s.carrierKey);
  }

  assignedKeys(): Set<string> {
    return new Set(this.slots.filter((s) => s.carrierKey).map((s) => s.carrierKey!));
  }

  forCarrier(key: string): Slot[] {
    return this.slots.filter((s) => s.carrierKey === key);
  }

  /** Reopen persisted assignments whose carrier is still alive and matches the slot's mode; close the rest. */
  restore(now: number, isAlive: (key: string, mode: Mode) => boolean): { restored: number; closed: number } {
    let restored = 0;
    let closed = 0;
    for (const row of this.repo.listOpen()) {
      const slot = this.byUnit.get(row.unit_id);
      if (slot && slot.slot === row.slot && isAlive(row.carrier_key, slot.mode)) {
        slot.carrierKey = row.carrier_key;
        slot.assignedAt = row.from_ts;
        restored++;
      } else {
        this.repo.close(row.unit_id, now, "stale-on-restart");
        closed++;
      }
    }
    return { restored, closed };
  }

  assign(slot: Slot, key: string, now: number, reason = "initial"): void {
    if (slot.carrierKey) this.repo.close(slot.unitId, now, reason);
    slot.carrierKey = key;
    slot.assignedAt = now;
    this.repo.open(slot.unitId, slot.slot, key, now, reason);
  }

  release(slot: Slot, now: number, reason: string): void {
    if (!slot.carrierKey) return;
    this.repo.close(slot.unitId, now, reason);
    slot.carrierKey = null;
    slot.assignedAt = 0;
  }

  pruneClosedBefore(ts: number): number {
    return this.repo.pruneClosedBefore(ts);
  }
}
