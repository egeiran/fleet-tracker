import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import type { Health } from "@vakt/domain";
import type { Config } from "../config";
import type { FleetService } from "../core/service";
import type { SseHub } from "./sseHub";

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
      maxAge: 600,
    }),
  );
  app.use("/api/*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Vary", "Origin");
  });

  app.get("/", (c) => c.text("vakt ingest · see /api/health"));

  app.get("/api/health", (c) => {
    const base = deps.health();
    const body: Health = { ok: true, version: deps.config.version, coverage: deps.service.coverage, sse: { clients: deps.hub.size }, ...base };
    return c.json(body);
  });

  app.get("/api/snapshot", (c) => {
    const { json, version } = deps.service.snapshotJson();
    const etag = `"v${version}"`;
    if (c.req.header("if-none-match") === etag) return c.body(null, 304);
    c.header("ETag", etag);
    c.header("Cache-Control", "no-store");
    c.header("Content-Type", "application/json; charset=utf-8");
    if (c.req.query("tracks") === "0") {
      const snap = JSON.parse(json) as { units: { track: unknown }[] };
      snap.units = snap.units.map((u) => ({ ...u, track: [] }));
      return c.body(JSON.stringify(snap));
    }
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
    const lastId = c.req.header("last-event-id") ?? c.req.query("lastEventId") ?? null;
    return streamSSE(
      c,
      async (stream) => {
        const client = { send: (m: { id: string; event: string; data: string }) => stream.writeSSE(m) };
        if (!deps.hub.add(client)) {
          await stream.writeSSE({ event: "resync", data: JSON.stringify({ type: "resync" }) });
          return;
        }
        c.header("X-Accel-Buffering", "no");
        await stream.writeSSE({
          id: deps.hub.lastId,
          event: "hello",
          data: JSON.stringify({ type: "hello", version: deps.service.version, generatedAt: Date.now() }),
        });
        const replay = deps.hub.replayAfter(lastId);
        if (replay === null) await stream.writeSSE({ event: "resync", data: JSON.stringify({ type: "resync" }) });
        else for (const m of replay) await stream.writeSSE(m);
        await new Promise<void>((resolve) => {
          stream.onAbort(() => {
            deps.hub.remove(client);
            resolve();
          });
        });
      },
      async () => {
        /* stream errors are handled by the hub dropping the client */
      },
    );
  });

  return app;
}
