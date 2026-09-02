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

function isSnapshot(x: unknown): x is Snapshot {
  return !!x && typeof x === "object" && Array.isArray((x as Snapshot).units) && typeof (x as Snapshot).generatedAt === "number";
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
  let dirty = false;
  let refetching = false;

  const subs = new Set<(s: FleetSnapshotView) => void>();
  const statusSubs = new Set<(s: ProviderStatus, at: number | null) => void>();

  const setStatus = (s: ProviderStatus) => {
    if (s === status) return;
    status = s;
    for (const cb of statusSubs) cb(status, lastUpdate);
  };
  const touch = () => {
    lastUpdate = Date.now();
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
    try {
      const res = await fetch(`${base}/api/snapshot`, { cache: "no-store" });
      if (!res.ok) throw new Error(`snapshot ${res.status}`);
      const body: unknown = await res.json();
      if (!isSnapshot(body)) throw new Error("snapshot shape");
      if (stopped) return false;
      applySnapshot(body);
      touch();
      return true;
    } catch {
      return false;
    } finally {
      refetching = false;
    }
  };

  const handleEvent = (type: string, data: string) => {
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
        if (!u) return;
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
          trackCoverageFrom: track[0]![2],
          trackCoverageTo: ev.point[2],
        });
        scheduleFlush();
        break;
      }
      case "status": {
        const u = units.get(ev.id);
        if (!u) return;
        units.set(u.id, { ...u, status: ev.status, stale: ev.stale, place: ev.place });
        scheduleFlush();
        break;
      }
      case "unit":
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
      void fetchSnapshot().then((ok) => {
        if (stopped) return;
        if (!ok) {
          setStatus("unavailable");
          return;
        }
        setStatus("live");
        sse = openSse(`${base}/api/events`, {
          onEvent: handleEvent,
          onOpen: () => {
            setStatus("live");
            void fetchSnapshot();
          },
          onStale: () => setStatus("stale"),
          onOffline: () => setStatus("offline"),
        });
      });
    },
    stop() {
      stopped = true;
      sse?.close();
      sse = null;
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = null;
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
