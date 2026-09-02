import { describe, expect, it } from "vitest";
import { gridCluster, type ProjectedUnit } from "../src/cluster";

const p = (id: string, x: number, y: number, status: ProjectedUnit["status"] = "moving"): ProjectedUnit => ({
  id,
  x,
  y,
  status,
  pos: [x / 10, y / 10],
});

describe("gridCluster", () => {
  it("groups units sharing a cell and leaves singles alone", () => {
    const res = gridCluster([p("a", 5, 5), p("b", 10, 12, "alert"), p("c", 100, 100)], 48, null);
    expect(res.clusters).toHaveLength(1);
    expect(res.clusters[0]!.n).toBe(2);
    expect(res.clusters[0]!.alert).toBe(1);
    expect(res.clusters[0]!.moving).toBe(1);
    expect(res.clusters[0]!.pos).toEqual([0.75, 0.85]);
    expect([...res.clusteredIds]).toEqual(["a", "b"]);
  });
  it("dissolves the cell holding the selected unit", () => {
    const res = gridCluster([p("a", 5, 5), p("b", 10, 12)], 48, "b");
    expect(res.clusters).toHaveLength(0);
    expect(res.clusteredIds.size).toBe(0);
  });
  it("returns clusters in a stable key order", () => {
    const pts = [p("a", 500, 500), p("b", 510, 510), p("c", 5, 5), p("d", 6, 6)];
    const keys = gridCluster(pts, 48, null).clusters.map((c) => c.key);
    expect(keys).toEqual([...keys].sort());
  });
});
