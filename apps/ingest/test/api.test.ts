import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/api/app";
import { MAX_CLIENTS, MAX_PENDING, SseHub } from "../src/api/sseHub";
import { loadConfig } from "../src/config";
import { FleetService } from "../src/core/service";
import { openDb } from "../src/db/sqlite";

function make() {
  const config = loadConfig({ FLEET_SEA: "1", FLEET_RAIL: "1", FLEET_ROAD: "2", CORS_ORIGINS: "https://vakt.example" });
  const service = new FleetService({ db: openDb(":memory:"), config });
  service.boot();
  const hub = new SseHub();
  const service2 = service as unknown as { deps: { eventCursor?: () => string } };
  service2.deps.eventCursor = () => hub.lastId;
  service.onEvent((e) => hub.broadcast(e));
  const app = createApp({
    config,
    service,
    hub,
    health: () => ({
      uptimeSec: 1,
      db: { positions: 0 },
      entur: { ok: true, vehicles: 0 },
      stream: { connected: false, reconnects: 0, linesPerMin: 0 },
    }),
  });
  return { app, service, hub };
}

describe("api", () => {
  it("serves snapshot with ETag and CORS for allowed origins", async () => {
    const { app } = make();
    const res = await app.request("/api/snapshot", { headers: { Origin: "https://vakt.example" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://vakt.example");
    const etag = res.headers.get("etag");
    const body = (await res.json()) as { units: { track: unknown[] }[]; source: string };
    expect(body.units.length).toBe(3);
    expect(body.units.every((u) => u.track.length <= 200)).toBe(true);
    const again = await app.request("/api/snapshot", { headers: { "If-None-Match": etag! } });
    expect(again.status).toBe(304);
    const preview = await app.request("/api/snapshot", { headers: { Origin: "https://x.vercel.app" } });
    expect(preview.headers.get("access-control-allow-origin")).toBe("https://x.vercel.app");
    const denied = await app.request("/api/snapshot", { headers: { Origin: "https://evil.example" } });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("returns units by id and 404 otherwise", async () => {
    const { app, service } = make();
    const id = service.units()[0]!.id;
    expect((await app.request(`/api/units/${id}`)).status).toBe(200);
    expect((await app.request("/api/units/VKT-0000")).status).toBe(404);
    expect((await app.request("/api/units/%3Cscript%3E")).status).toBe(400);
  });
  it("health is always 200 and SSE greets then replays", async () => {
    const { app, hub } = make();
    expect((await app.request("/api/health")).status).toBe(200);
    hub.broadcast({ type: "heartbeat", at: 1 });
    hub.broadcast({ type: "heartbeat", at: 2 });
    const first = `${hub.bootId}:1`;
    const res = await app.request("/api/events", { headers: { "Last-Event-ID": first } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("event: hello");
    await reader.cancel();
    expect(hub.replayAfter(first)!.map((m) => m.id)).toEqual([`${hub.bootId}:2`]);
    expect(hub.replayAfter("other:1")).toBeNull();
    expect(hub.replayAfter(null)).toEqual([]);

    // A malformed or foreign id must trigger a resync rather than a silent gap.
    for (const bad of ["123", "other:1"]) {
      const r = await app.request("/api/events", { headers: { "Last-Event-ID": bad } });
      const rd = r.body!.getReader();
      let text = "";
      while (!text.includes("resync")) {
        const { value, done } = await rd.read();
        if (done) break;
        text += new TextDecoder().decode(value);
      }
      await rd.cancel();
      expect(text).toContain("event: resync");
    }
  });

  it("snapshot exposes the SSE cursor", async () => {
    const { app, hub } = make();
    hub.broadcast({ type: "heartbeat", at: 1 });
    const res = await app.request("/api/snapshot?tracks=0", { headers: { Origin: "https://vakt.example" } });
    expect(res.headers.get("x-event-id")).toBe(`${hub.bootId}:1`);
    expect(res.headers.get("access-control-expose-headers")).toContain("X-Event-Id");
  });

  it("refuses new subscribers with 503 when the hub is full and drops slow readers", async () => {
    const { app, hub } = make();
    const stuck = { send: () => new Promise<void>(() => {}), close: vi.fn() };
    for (let i = 0; i < MAX_CLIENTS; i++) hub.add({ send: async () => {}, close: () => {} });
    expect(hub.add(stuck)).toBe(false);
    const res = await app.request("/api/events");
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("30");

    const hub2 = new SseHub();
    hub2.add(stuck);
    for (let i = 0; i <= MAX_PENDING; i++) hub2.broadcast({ type: "heartbeat", at: i });
    expect(hub2.size).toBe(0);
    expect(stuck.close).toHaveBeenCalled();
  });
});
