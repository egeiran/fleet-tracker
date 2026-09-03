import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import type { Health } from "@vakt/domain";
import type { Config } from "../config";
import type { FleetService } from "../core/service";
import type { SseHub, SseMessage } from "./sseHub";

export interface AppDeps {
  config: Config;
  service: FleetService;
  hub: SseHub;
  health: () => Omit<Health, "ok" | "version" | "coverage" | "sse">;
}

function originAllowed(origin: string, allow: string[]): boolean {
  if (allow.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return host.endsWith(".vercel.app") || host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  app.use(
    "/api/*",
    cors({
      origin: (origin) => (origin && originAllowed(origin, deps.config.corsOrigins) ? origin : ""),
      allowMethods: ["GET", "OPTIONS"],
      exposeHeaders: ["ETag", "X-Event-Id"],
      maxAge: 600,
    }),
  );
  app.use("/api/*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
  });

  app.get("/", (c) => c.text("vakt ingest · see /api/health"));

  app.get("/api/health", (c) => {
    const base = deps.health();
    const body: Health = { ok: true, version: deps.config.version, coverage: deps.service.coverage, sse: { clients: deps.hub.size }, ...base };
    return c.json(body);
  });

  app.get("/api/snapshot", (c) => {
    const withTracks = c.req.query("tracks") !== "0";
    const { json, version, cursor } = deps.service.snapshotJson(withTracks);
    const etag = `"v${version}${withTracks ? "" : "-bare"}"`;
    if (c.req.header("if-none-match") === etag) return c.body(null, 304);
    c.header("ETag", etag);
    // Clients open /api/events from this cursor so nothing between snapshot and hello is lost.
    if (cursor) c.header("X-Event-Id", cursor);
    c.header("Cache-Control", "no-store");
    c.header("Content-Type", "application/json; charset=utf-8");
    return c.body(json);
  });

  app.get("/api/units/:id", (c) => {
    const id = c.req.param("id").toUpperCase();
    if (!/^[A-Z0-9-]{1,32}$/.test(id)) return c.json({ error: "invalid id" }, 400);
    const unit = deps.service.unit(id);
    if (!unit) return c.json({ error: "not found" }, 404);
    c.header("Cache-Control", "no-store");
    return c.json(unit);
  });

  app.get("/api/events", (c) => {
    const rawLastId = c.req.header("last-event-id") ?? c.req.query("lastEventId") ?? null;
    // Absent id → nothing to replay; malformed id → resync (never a silent gap).
    const lastIdValid = rawLastId !== null && /^[a-z0-9]{1,8}:\d{1,12}$/.test(rawLastId);
    if (deps.hub.full) {
      // A non-200 makes EventSource stop reconnecting instead of hammering /api/snapshot.
      c.header("Retry-After", "30");
      return c.text("too many subscribers", 503);
    }
    c.header("X-Accel-Buffering", "no");
    c.header("Cache-Control", "no-store");
    return streamSSE(
      c,
      async (stream) => {
        let done: () => void = () => {};
        const finished = new Promise<void>((resolve) => {
          done = resolve;
        });
        // Live frames that arrive while the replay is being written are held back so the
        // client never sees an older replayed frame after a newer live one.
        let replaying = true;
        let queued: SseMessage[] = [];
        const client = {
          send: (m: SseMessage) => {
            if (replaying) {
              queued.push(m);
              return;
            }
            return stream.writeSSE(m);
          },
          close: () => {
            done();
            // A dropped slow reader should not keep its socket: queued frames would otherwise wait for it to drain.
            (c.env as { outgoing?: { destroy?: () => void } } | undefined)?.outgoing?.destroy?.();
          },
        };
        // Register the abort listener before any await so a client that drops mid-handshake is still removed.
        stream.onAbort(() => {
          deps.hub.remove(client);
          done();
        });
        if (stream.aborted || !deps.hub.add(client)) {
          deps.hub.remove(client);
          return;
        }
        await stream.writeSSE({
          event: "hello",
          data: JSON.stringify({ type: "hello", version: deps.service.version, generatedAt: Date.now() }),
        });
        const replay = rawLastId === null ? [] : lastIdValid ? deps.hub.replayAfter(rawLastId) : null;
        if (replay === null) {
          // Carry the current cursor so a later reconnect does not resend the stale id.
          await stream.writeSSE({ id: deps.hub.lastId, event: "resync", data: JSON.stringify({ type: "resync" }) });
        } else {
          for (const m of replay) await stream.writeSSE(m);
        }
        const lastSeq = replay?.length ? deps.hub.sequenceOf(replay[replay.length - 1]!.id) : -1;
        for (const m of queued) if (deps.hub.sequenceOf(m.id) > lastSeq) await stream.writeSSE(m);
        queued = [];
        replaying = false;
        await finished;
        deps.hub.remove(client);
      },
      async () => {
        /* write errors are handled by the hub dropping the client */
      },
    );
  });

  return app;
}
