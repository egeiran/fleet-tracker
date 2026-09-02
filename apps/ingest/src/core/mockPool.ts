import { DAY_MS, type Mode, type Unit } from "@vakt/domain";
import { buildFleet, MOCK_NOW } from "@vakt/mock";

/**
 * Prototype mock units used for road slots (always) and as a stand-in for sea slots when
 * BarentsWatch credentials are missing. Tracks are re-anchored so "now" is the wall clock.
 */
export class MockPool {
  private byMode = new Map<Mode, Unit[]>();

  constructor(size = 160) {
    const fleet = buildFleet({ size });
    for (const u of fleet) {
      const arr = this.byMode.get(u.mode) ?? [];
      arr.push(u);
      this.byMode.set(u.mode, arr);
    }
  }

  unitFor(mode: Mode, index: number, unitId: string, slot: number, now: number): Unit | null {
    const list = this.byMode.get(mode);
    if (!list?.length) return null;
    const base = list[index % list.length]!;
    const shift = now - MOCK_NOW;
    const track = base.track.map(([lon, lat, ts]) => [lon, lat, ts + shift] as [number, number, number]);
    return {
      ...base,
      id: unitId,
      slot,
      source: "mock",
      positionTs: now,
      events: base.events.map((e) => ({ ...e, ts: e.ts + shift })),
      track,
      trackCoverageFrom: now - DAY_MS,
      trackCoverageTo: now,
    };
  }
}
