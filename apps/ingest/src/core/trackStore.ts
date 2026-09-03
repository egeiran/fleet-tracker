import { downsampleTrack, shouldKeepPoint, sortTrack, type TrackPoint } from "@vakt/domain";
import type { PositionRow, PositionsRepo } from "../db/repos";

export interface PointExtra {
  sog?: number | null;
  cog?: number | null;
  heading?: number | null;
  navStatus?: number | null;
}

const MAX_POINTS = 3000;

/** Hot per-carrier tracks with write-through batching to SQLite. Only assigned carriers are tracked. */
export class TrackStore {
  private hot = new Map<string, TrackPoint[]>();
  private pending: PositionRow[] = [];

  constructor(
    private repo: PositionsRepo,
    private keepMs: number,
  ) {}

  loadHot(now: number): number {
    const loaded = this.repo.loadSince(now - this.keepMs);
    this.hot = loaded;
    let n = 0;
    for (const t of loaded.values()) n += t.length;
    return n;
  }

  track(key: string): TrackPoint[] {
    return this.hot.get(key) ?? [];
  }

  /** Drop the hot track of a released carrier; persisted rows age out via prune(). */
  forget(key: string): void {
    this.hot.delete(key);
  }

  /** Append a live point; returns true when it survived downsampling. */
  append(key: string, point: TrackPoint, extra: PointExtra = {}, src: "hist" | "live" = "live"): boolean {
    let arr = this.hot.get(key);
    if (!arr) {
      arr = [];
      this.hot.set(key, arr);
    }
    const last = arr[arr.length - 1];
    if (last && point[2] <= last[2]) return false;
    if (!shouldKeepPoint(last, point)) return false;
    arr.push(point);
    if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS);
    this.pending.push(this.row(key, point, extra, src));
    return true;
  }

  /** Merge a history batch (sorted or not) into the existing track. */
  merge(key: string, points: TrackPoint[], src: "hist" | "live" = "hist"): number {
    const existing = this.hot.get(key) ?? [];
    const seen = new Set(existing.map((p) => p[2]));
    const fresh = points.filter((p) => !seen.has(p[2]));
    if (!fresh.length) return 0;
    const merged = downsampleTrack(sortTrack([...existing, ...fresh]));
    if (merged.length > MAX_POINTS) merged.splice(0, merged.length - MAX_POINTS);
    this.hot.set(key, merged);
    const kept = new Set(merged.map((p) => p[2]));
    let n = 0;
    for (const p of fresh) {
      if (kept.has(p[2])) {
        this.pending.push(this.row(key, p, {}, src));
        n++;
      }
    }
    return n;
  }

  flush(): number {
    if (!this.pending.length) return 0;
    const rows = this.pending;
    this.pending = [];
    try {
      this.repo.insertMany(rows);
    } catch (e) {
      // Keep the rows for the next flush instead of losing them.
      this.pending = rows.concat(this.pending);
      throw e;
    }
    return rows.length;
  }

  prune(now: number): number {
    const cutoff = now - this.keepMs;
    for (const [k, arr] of this.hot) {
      let i = 0;
      while (i < arr.length && arr[i]![2] < cutoff) i++;
      if (i) arr.splice(0, i);
      if (!arr.length) this.hot.delete(k);
    }
    return this.repo.pruneBefore(cutoff);
  }

  private row(key: string, p: TrackPoint, e: PointExtra, src: "hist" | "live"): PositionRow {
    return {
      carrier_key: key,
      ts: p[2],
      lon: p[0],
      lat: p[1],
      sog: e.sog ?? null,
      cog: e.cog ?? null,
      heading: e.heading ?? null,
      nav_status: e.navStatus ?? null,
      src,
    };
  }
}
