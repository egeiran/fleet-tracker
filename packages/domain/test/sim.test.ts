import { describe, expect, it } from "vitest";
import { simulate, type SimContext } from "../src/sim";
import type { TrackPoint } from "../src/types";

const track: TrackPoint[] = Array.from({ length: 50 }, (_, i) => [10 + i * 0.01, 59 + i * 0.005, 1_700_000_000_000 + i * 600_000]);

function ctx(over: Partial<SimContext> = {}): SimContext {
  return {
    mode: "sjø",
    status: "moving",
    track,
    assignedAt: track[0]![2],
    now: track[track.length - 1]![2],
    carrierLabel: "MS TEST",
    placeForPoint: () => "Skagerrak",
    timeZone: "UTC",
    ...over,
  };
}

describe("simulate", () => {
  it("is deterministic per unit id", () => {
    expect(simulate("VKT-1234", ctx())).toEqual(simulate("VKT-1234", ctx()));
    expect(simulate("VKT-1234", ctx()).batt).not.toBe(simulate("VKT-4321", ctx()).batt);
  });
  it("alert share lands around 8 % and alert coords are real track points", () => {
    let alerts = 0;
    for (let i = 0; i < 2000; i++) {
      const res = simulate(`VKT-${i}`, ctx());
      if (res.status === "alert") {
        alerts++;
        const ev = res.events.find((e) => e.tone === "alert")!;
        expect(track.some((p) => p[0] === ev.coord![0] && p[1] === ev.coord![1])).toBe(true);
        expect(res.events[0]!.label).toBe("Varsel sendt til driftssenteret");
      }
    }
    expect(alerts / 2000).toBeGreaterThan(0.06);
    expect(alerts / 2000).toBeLessThan(0.1);
  });
  it("never alerts on a one-point track", () => {
    for (let i = 0; i < 300; i++) {
      expect(simulate(`VKT-${i}`, ctx({ track: [track[0]!] })).status).toBe("moving");
    }
  });
  it("events are newest first and boarding event is not simulated", () => {
    const res = simulate("VKT-7", ctx());
    for (let i = 1; i < res.events.length; i++) expect(res.events[i]!.ts).toBeLessThanOrEqual(res.events[i - 1]!.ts);
    const boarding = res.events.find((e) => e.label.startsWith("Om bord"))!;
    expect(boarding.simulated).toBe(false);
    expect(boarding.time).toMatch(/(^|i går )\d{2}:\d{2}$/);
  });
  it("battery drains with assignment age and idle units can be unbooked", () => {
    const fresh = simulate("VKT-42", ctx());
    const old = simulate("VKT-42", ctx({ now: track[0]![2] + 100 * 3_600_000 }));
    expect(old.batt).toBeLessThan(fresh.batt);
    const idle = Array.from({ length: 200 }, (_, i) => simulate(`VKT-${i}`, ctx({ status: "idle", moored: true })));
    expect(idle.some((u) => u.booking === "ubooket")).toBe(true);
    expect(idle.every((u) => u.status !== "alert" || u.events.some((e) => e.tone === "alert"))).toBe(true);
  });
});
