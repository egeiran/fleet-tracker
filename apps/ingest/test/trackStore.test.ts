import { describe, expect, it } from "vitest";
import { PositionsRepo } from "../src/db/repos";
import { openDb } from "../src/db/sqlite";
import { TrackStore } from "../src/core/trackStore";

const H = 3_600_000;

describe("TrackStore", () => {
  it("downsamples on append, persists on flush and reloads from SQLite", () => {
    const db = openDb(":memory:");
    const repo = new PositionsRepo(db);
    const store = new TrackStore(repo, 25 * H);
    const now = Date.now();
    let kept = 0;
    for (let i = 0; i < 100; i++) if (store.append("ais:1", [10, 60, now - H + i * 10_000], { sog: 5 })) kept++;
    expect(kept).toBe(17);
    expect(store.append("ais:1", [10, 60, now - 2 * H])).toBe(false); // out of order
    expect(store.flush()).toBe(17);
    expect(repo.count()).toBe(17);
    const again = new TrackStore(repo, 25 * H);
    expect(again.loadHot(now)).toBe(17);
    expect(again.track("ais:1")).toEqual(store.track("ais:1"));
  });
  it("merges history without duplicates and prunes old points", () => {
    const db = openDb(":memory:");
    const repo = new PositionsRepo(db);
    const store = new TrackStore(repo, 25 * H);
    const now = Date.now();
    store.append("ais:2", [10, 60, now]);
    const hist: [number, number, number][] = [
      [9.9, 59.9, now - 30 * H],
      [9.95, 59.95, now - 2 * H],
      [10, 60, now],
    ];
    expect(store.merge("ais:2", hist)).toBe(2);
    expect(store.track("ais:2").map((p) => p[2])).toEqual([now - 30 * H, now - 2 * H, now]);
    store.flush();
    store.prune(now);
    expect(store.track("ais:2").map((p) => p[2])).toEqual([now - 2 * H, now]);
    expect(repo.count()).toBe(2);
  });
});
