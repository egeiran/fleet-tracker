import type { LngLat } from "./types";

const EARTH_R = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearingDeg(from: LngLat, to: LngLat): number {
  const φ1 = toRad(from[1]);
  const φ2 = toRad(to[1]);
  const Δλ = toRad(to[0] - from[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const COMPASS_NO = ["N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV"] as const;
export function compass8(bearing: number): string {
  const idx = Math.round((((bearing % 360) + 360) % 360) / 45) % 8;
  return COMPASS_NO[idx] ?? "N";
}

export type Bbox = [[number, number], [number, number]];

export function inBbox(p: LngLat, bbox: Bbox): boolean {
  return p[0] >= bbox[0][0] && p[0] <= bbox[1][0] && p[1] >= bbox[0][1] && p[1] <= bbox[1][1];
}

export function bboxToPolygon(bbox: Bbox): { type: "Polygon"; coordinates: number[][][] } {
  const [[w, s], [e, n]] = bbox;
  return {
    type: "Polygon",
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  };
}

/* ---- Route geometry (prototype port). Distances are in planar degrees on purpose: the
   prototype's motion is defined that way and the map is small enough that it reads right. ---- */

interface SegInfo {
  seg: number[];
  total: number;
}
const segCache = new WeakMap<LngLat[], SegInfo>();

export function segLengths(path: LngLat[]): SegInfo {
  const cached = segCache.get(path);
  if (cached) return cached;
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push(d);
    total += d;
  }
  const info = { seg, total };
  segCache.set(path, info);
  return info;
}

/** Position at fraction `f` (0–1) of the route's length. */
export function posAt(path: LngLat[], f: number): LngLat {
  if (path.length === 0) return [0, 0];
  if (path.length < 2) return path[0]!;
  const { seg, total } = segLengths(path);
  const want = total * f;
  let acc = 0;
  for (let i = 0; i < seg.length; i++) {
    const d = seg[i]!;
    if (acc + d >= want || i === seg.length - 1) {
      const q = d === 0 ? 1 : Math.min(1, (want - acc) / d);
      const a = path[i]!;
      const b = path[i + 1]!;
      return [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q];
    }
    acc += d;
  }
  return path[path.length - 1]!;
}

/** Sub-route between two fractions — the short wake behind a moving unit. */
export function sliceAt(path: LngLat[], f0: number, f1: number): LngLat[] | null {
  if (path.length < 2 || f1 <= f0) return null;
  const { seg, total } = segLengths(path);
  const d0 = total * Math.max(0, f0);
  const d1 = total * Math.min(1, f1);
  const out: LngLat[] = [posAt(path, Math.max(0, f0))];
  let acc = 0;
  for (let i = 0; i < seg.length; i++) {
    const end = acc + seg[i]!;
    if (end > d0 && end < d1) out.push(path[i + 1]!);
    acc = end;
  }
  out.push(posAt(path, Math.min(1, f1)));
  return out.length > 1 ? out : null;
}

/** Route from the start up to fraction `f`. */
export function trailAt(path: LngLat[], f: number): LngLat[] | null {
  if (path.length < 2) return null;
  const { seg, total } = segLengths(path);
  const want = total * f;
  let acc = 0;
  const out: LngLat[] = [path[0]!];
  for (let i = 0; i < seg.length; i++) {
    if (acc + seg[i]! > want) break;
    acc += seg[i]!;
    out.push(path[i + 1]!);
  }
  out.push(posAt(path, f));
  return out.length > 1 ? out : null;
}

export function bboxOf(points: LngLat[]): Bbox | null {
  if (points.length === 0) return null;
  let minX = 180;
  let minY = 90;
  let maxX = -180;
  let maxY = -90;
  for (const p of points) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  if (maxX < minX) return null;
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}

/** A tight cluster has zero extent; pad so fitBounds always has something to frame. */
export function padBbox(b: Bbox): Bbox {
  const w = b[1][0] - b[0][0];
  const h = b[1][1] - b[0][1];
  const m0 = Math.max(0.02, w * 0.25);
  const m1 = Math.max(0.012, h * 0.25);
  return [
    [b[0][0] - m0, b[0][1] - m1],
    [b[1][0] + m0, b[1][1] + m1],
  ];
}
