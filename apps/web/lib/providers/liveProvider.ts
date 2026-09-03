import {
  DAY_MS,
  fracAtTime,
  posAt,
  splitPath,
  timeAt,
  windowEndingAt,
  type Coverage,
  type IngestEvent,
  type LngLat,
  type Snapshot,
  type TimeWindow,
  type TrackPoint,
  type Unit,
} from "@vakt/domain";
import { openSse, type SseClient } from "./sse";
import type { FleetProvider, FleetSnapshotView, ProviderStatus } from "./types";

interface Split {
  path: LngLat[];
  timestamps: number[];
}
const splitCache = new WeakMap<Unit, Split>();
function split(u: Unit): Split {
  let s = splitCache.get(u);
  if (!s) {
    s = u.track.length ? splitPath(u.track) : { path: [u.position], timestamps: [u.positionTs] };
    splitCache.set(u, s);
  }
  return s;
}

function isUnit(x: unknown): x is Unit {
  if (!x || typeof x !== "object") return false;
  const u = x as Unit;
  return typeof u.id === "string" && Array.isArray(u.track) && Array.isArray(u.position) && Array.isArray(u.events) && !!u.carrier;
}

function isPoint(p: unknown): p is TrackPoint {
  return Array.isArray(p) && p.length === 3 && p.every((v) => typeof v === "number" && Number.isFinite(v));
}

function isSnapshot(x: unknown): x is Snapshot {
  if (!x || typeof x !== "object") return false;
  const s = x as Snapshot;
  return typeof s.generatedAt === "number" && Array.isArray(s.units) && s.units.every(isUnit) && !!s.coverage;
}

/**
 * Live fleet from the ingest worker: one snapshot fetch, then SSE deltas coalesced and flushed
 * at most twice a second. Units keep their object identity until something about them changes.
 */
export function createLiveProvider(baseUrl: string): FleetProvider {
  const base = baseUrl.replace(/\/+$/, "");
  let units = new Map<string, Unit>();
  let coverage: Coverage | null = null;
  let attribution: string[] = [];
  let window: TimeWindow = windowEndingAt(Date.now());
  let snap: FleetSnapshotView | null = null;
  let status: ProviderStatus = "connecting";
  let lastUpdate: number | null = null;
  let sse: SseClient | null = null;
  let stopped = false;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  let refetching = false;
  let lastTouch = 0;
  let snapshotCursor: string | null = null;
  /** Events that arrive while a snapshot is in flight; replayed on top of it so nothing is lost. */
  let held: [string, string][] | null = null;

  const subs = new Set<(s: FleetSnapshotView) => void>();
  const statusSubs = new Set<(s: ProviderStatus, at: number | null) => void>();

  const setStatus = (s: ProviderStatus) => {
    if (s === status) return;
    status = s;
    for (const cb of statusSubs) cb(status, lastUpdate);
  };
  // Every SSE frame would otherwise re-render the header badge; once per flush cadence is plenty.
  const touch = () => {
    lastUpdate = Date.now();
    if (lastUpdate - lastTouch < 500) return;
    lastTouch = lastUpdate;
    for (const cb of statusSubs) cb(status, lastUpdate);
  };

  const emit = () => {
    window = windowEndingAt(Date.now());
    snap = { units: [...units.values()], window, coverage, attribution };
    for (const cb of subs) cb(snap);
  };

  const scheduleFlush = () => {
    dirty = true;
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      if (dirty) {
        dirty = false;
        emit();
      }
    }, 500);
  };

  const applySnapshot = (s: Snapshot) => {
    units = new Map(s.units.map((u) => [u.id, u]));
    coverage = s.coverage;
    attribution = s.attribution;
    emit();
  };

  const fetchSnapshot = async (): Promise<boolean> => {
    if (refetching) return true;
    refetching = true;
    held = [];
    try {
      const res = await fetch(`${base}/api/snapshot`, { cache: "no-store" });
      if (!res.ok) throw new Error(`snapshot ${res.status}`);
      const body: unknown = await res.json();
      if (!isSnapshot(body)) throw new Error("snapshot shape");
      if (stopped) return false;
      snapshotCursor = res.headers.get("x-event-id");
      applySnapshot(body);
      touch();
      return true;
    } catch {
      return false;
    } finally {
      refetching = false;
      const replay = held;
      held = null;
      if (replay) for (const [type, data] of replay) handleEvent(type, data);
    }
  };

  const handleEvent = (type: string, data: string) => {
    if (held) {
      held.push([type, data]);
      return;
    }
    let ev: IngestEvent;
    try {
      ev = JSON.parse(data) as IngestEvent;
    } catch {
      return;
    }
    touch();
    switch (ev.type) {
      case "position": {
        const u = units.get(ev.id);
        if (!u || !isPoint(ev.point)) return;
        const cutoff = ev.point[2] - DAY_MS;
        const last = u.track[u.track.length - 1];
        if (last && ev.point[2] <= last[2]) return;
        const track = [...u.track.filter((p) => p[2] >= cutoff), ev.point];
        units.set(u.id, {
          ...u,
          track,
          position: [ev.point[0], ev.point[1]],
          positionTs: ev.point[2],
          heading: ev.heading ?? u.heading,
          status: ev.status,
          stale: ev.stale,
          place: typeof ev.place === "string" ? ev.place : u.place,
          trackCoverageFrom: track[0]![2],
          trackCoverageTo: ev.point[2],
        });
        scheduleFlush();
        break;
      }
      case "status": {
        const u = units.get(ev.id);
        if (!u) return;
        units.set(u.id, { ...u, status: ev.status, stale: ev.stale, place: typeof ev.place === "string" ? ev.place : u.place });
        scheduleFlush();
        break;
      }
      case "unit":
        if (!isUnit(ev.unit)) return;
        units.set(ev.unit.id, ev.unit);
        scheduleFlush();
        break;
      case "coverage":
        coverage = ev.coverage;
        scheduleFlush();
        break;
      case "resync":
        void fetchSnapshot();
        break;
      case "hello":
      case "heartbeat":
        setStatus("live");
        break;
    }
  };

  return {
    kind: "live",
    clockTimeZone: "Europe/Oslo",
    start() {
      stopped = false;
      setStatus("connecting");
      let attempt = 0;
      const boot = () => {
        void fetchSnapshot().then((ok) => {
          if (stopped) return;
          if (!ok) {
            // The worker may be restarting; keep trying with capped backoff instead of giving up.
            setStatus("unavailable");
            attempt++;
            retryTimer = setTimeout(boot, Math.min(30_000, 2000 * 2 ** Math.min(attempt, 4)));
            return;
          }
          setStatus("live");
          // Start the stream from the snapshot's cursor: the server replays anything since, or asks for a resync.
          sse = openSse(
            `${base}/api/events`,
            {
              onEvent: handleEvent,
              onOpen: () => setStatus("live"),
              onStale: () => setStatus("stale"),
              onOffline: () => setStatus("offline"),
            },
            { lastEventId: snapshotCursor },
          );
        });
      };
      boot();
    },
    stop() {
      stopped = true;
      sse?.close();
      sse = null;
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = null;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      subs.clear();
      statusSubs.clear();
    },
    getSnapshot: () => snap,
    subscribe(cb) {
      subs.add(cb);
      if (snap) cb(snap);
      return () => subs.delete(cb);
    },
    onStatus(cb) {
      statusSubs.add(cb);
      cb(status, lastUpdate);
      return () => statusSubs.delete(cb);
    },
    fracAt(u, t) {
      const { path, timestamps } = split(u);
      return fracAtTime(path, timestamps, timeAt(window, t));
    },
    positionAt(u, t) {
      return posAt(split(u).path, this.fracAt(u, t));
    },
    pathOf: (u) => split(u).path,
    coverageStartT(u) {
      const from = u.trackCoverageFrom;
      if (from == null) return 100;
      const span = window.to - window.from;
      return Math.max(0, Math.min(100, ((from - window.from) / span) * 100));
    },
  };
}
