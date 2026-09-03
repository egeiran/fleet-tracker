import { serve } from "@hono/node-server";
import { TIMING, loadConfig } from "./config";
import { createApp } from "./api/app";
import { SseHub } from "./api/sseHub";
import { FleetService } from "./core/service";
import { openDb } from "./db/sqlite";
import { errMessage, logger, setLogLevel } from "./log";
import { BarentsWatchClient } from "./sources/barentswatch/client";
import { HistoryLoader } from "./sources/barentswatch/historyLoader";
import { StreamRunner } from "./sources/barentswatch/stream";
import { TokenProvider } from "./sources/barentswatch/token";
import { EnturClient } from "./sources/entur/client";
import { EnturPoller } from "./sources/entur/poller";

const config = loadConfig();
setLogLevel(config.logLevel);
const log = logger("main");
const startedAt = Date.now();

const db = openDb(config.dbPath);
const hub = new SseHub();

let history: HistoryLoader | null = null;
const service = new FleetService({ db, config, requestHistory: (mmsi) => history?.enqueue(mmsi), eventCursor: () => hub.lastId });
service.onEvent((e) => hub.broadcast(e));
service.boot();

/* ---- Entur: rail positions, no key ---- */
const entur = new EnturPoller(
  new EnturClient(config.enturClientName),
  config.bbox,
  (v) => service.onTrains(v),
  (s) => {
    if (s.ok) return;
    // First failures during startup stay "starting"; three in a row means the source is down.
    const state = service.coverage.rail.state === "starting" && s.consecutiveFailures < 3 ? "starting" : "degraded";
    service.setRailState({ state, detail: "Entur svarer ikke" });
  },
);

/* ---- BarentsWatch: optional; without credentials sea slots fall back to mock ---- */
let stream: StreamRunner | null = null;
if (config.barentswatch) {
  const tokens = new TokenProvider(config.barentswatch);
  const bw = new BarentsWatchClient(tokens);
  history = new HistoryLoader(
    bw,
    (r) => service.onHistory(r.mmsi, r.track),
    (mmsi) => log.warn("history gave up", { mmsi }),
  );
  stream = new StreamRunner(bw, {
    bbox: config.bbox,
    initialSince: service.streamSince,
    onMessage: (m) => service.onAis(m),
    onSince: (s) => {
      service.streamSince = s;
    },
    onStateChange: (s) => {
      // Upstream error bodies stay in the logs; clients only get a short, generic reason.
      service.setSeaState({
        state: s.connected ? "ok" : service.coverage.sea.state === "starting" ? "starting" : "degraded",
        detail: s.connected ? undefined : `gjenkobler (forsøk ${s.reconnects})`,
      });
    },
  });
  // Vessels restored from the database still need their history refreshed.
  for (const slot of service.fleet.ofMode("sjø")) {
    const key = slot.carrierKey;
    if (key?.startsWith("ais:")) history.enqueue(Number(key.slice(4)));
  }
  void (async () => {
    try {
      const latest = await bw.latestInArea({ bbox: config.bbox });
      log.info("seeded vessels", { count: latest.length });
      service.seedVessels(latest);
    } catch (e) {
      log.error("latest snapshot failed", { error: errMessage(e) });
      service.setSeaState({ state: "degraded", detail: "kunne ikke hente fartøyliste" });
    }
    stream?.start();
  })();
}

/* ---- HTTP first, so health and the road/mock units are reachable immediately ---- */
// COUNT(*) walks an index; cache it so health probes stay cheap.
let countCache = { at: 0, n: 0 };
function positionsCount(): number {
  if (Date.now() - countCache.at > 60_000) countCache = { at: Date.now(), n: service.positions.count() };
  return countCache.n;
}

const app = createApp({
  config,
  service,
  hub,
  health: () => ({
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    db: { positions: positionsCount() },
    entur: { ok: entur.stats.ok, vehicles: entur.stats.vehicles, lastSuccessAt: entur.stats.lastSuccessAt ?? undefined },
    stream: {
      connected: stream?.stats.connected ?? false,
      reconnects: stream?.stats.reconnects ?? 0,
      linesPerMin: stream?.rate() ?? 0,
      since: stream?.stats.since ?? undefined,
    },
  }),
});
const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info("listening", { port: info.port, barentswatch: !!config.barentswatch, fleet: config.fleet });
});
entur.start();

/* ---- timers ---- */
const timers = [
  setInterval(() => service.flush(), TIMING.dbFlushMs),
  setInterval(() => service.sweep(), TIMING.stalenessEveryMs),
  setInterval(() => service.rebalance(), TIMING.rebalanceEveryMs),
  setInterval(() => service.prune(), TIMING.pruneEveryMs),
  setInterval(() => hub.broadcast({ type: "heartbeat", at: Date.now() }), TIMING.heartbeatMs),
];

/* ---- shutdown ---- */
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("shutting down", { signal });
  for (const t of timers) clearInterval(t);
  entur.stop();
  history?.stop();
  await stream?.stop();
  hub.broadcast({ type: "resync" });
  service.flush();
  server.close();
  db.close();
  // Give the resync frames a moment to leave the socket before exiting.
  await new Promise((r) => setTimeout(r, 200));
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (e) => log.error("unhandled rejection", { error: errMessage(e) }));
