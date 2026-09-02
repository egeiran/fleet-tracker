import type { LngLat, Status } from "./types";

export interface ProjectedUnit {
  id: string;
  x: number;
  y: number;
  status: Status;
  pos: LngLat;
}

export interface Cluster {
  key: string;
  pos: LngLat;
  n: number;
  alert: number;
  moving: number;
  members: ProjectedUnit[];
}

export interface ClusterResult {
  clusters: Cluster[];
  clusteredIds: Set<string>;
}

/**
 * Screen-pixel grid clustering: units that share a cell are drawn as one disc.
 * A cell holding the selected unit is dissolved. Output order is stable (sorted by cell key)
 * so pool slots keep their index frame to frame.
 */
export function gridCluster(
  points: ProjectedUnit[],
  cellPx: number,
  selectedId: string | null,
): ClusterResult {
  const groups = new Map<string, ProjectedUnit[]>();
  for (const p of points) {
    const key = `${Math.floor(p.x / cellPx)}:${Math.floor(p.y / cellPx)}`;
    let g = groups.get(key);
    if (!g) {
      g = [];
      groups.set(key, g);
    }
    g.push(p);
  }
  const clusters: Cluster[] = [];
  const clusteredIds = new Set<string>();
  const keys = [...groups.keys()].sort();
  for (const key of keys) {
    const g = groups.get(key)!;
    if (g.length < 2) continue;
    if (selectedId && g.some((m) => m.id === selectedId)) continue;
    let lng = 0;
    let lat = 0;
    let alert = 0;
    let moving = 0;
    for (const m of g) {
      lng += m.pos[0];
      lat += m.pos[1];
      if (m.status === "alert") alert++;
      if (m.status === "moving") moving++;
      clusteredIds.add(m.id);
    }
    clusters.push({ key, pos: [lng / g.length, lat / g.length], n: g.length, alert, moving, members: g });
  }
  return { clusters, clusteredIds };
}
