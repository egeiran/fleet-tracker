import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/api/app";
import { MAX_CLIENTS, MAX_PENDING, SseHub } from "../src/api/sseHub";
import { loadConfig } from "../src/config";
import { FleetService } from "../src/core/service";
import { openDb } from "../src/db/sqlite";

function make() {
  const config = loadConfig({ FLEET_SEA: "1", FLEET_RAIL: "1", FLEET_ROAD: "2", CORS_ORIGINS: "https://vakt.example" });
  const hub = new SseHub();
  const service = new FleetService({ db: openDb(":memory:"), config, eventCursor: () => hub.lastId });
  service.onEvent((e) => hub.broadcast(e));
  service.boot();
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
    const first = hub.lastId; // boot() already emitted a coverage event, so ids are not 1-based here
    hub.broadcast({ type: "heartbeat", at: 2 });
    const second = hub.lastId;
    const res = await app.request("/api/events", { headers: { "Last-Event-ID": first } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("event: hello");
    await reader.cancel();
    expect(hub.replayAfter(first)!.map((m) => m.id)).toEqual([second]);
    expect(hub.replayAfter("other:1")).toBeNull();
    expect(hub.replayAfter(null)).toEqual([]);
    expect(hub.replayAfter(`${hub.bootId}:0`)!.length).toBe(3); // boot() coverage event + two heartbeats
    expect(hub.replayAfter(`${hub.bootId}:99`)).toEqual([]);
    expect(hub.replayAfter(`${hub.bootId}:x`)).toBeNull();

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

  it("flushes live frames after the replay in sequence order and drops a reader that stalls the replay", async () => {
    const { app, hub } = make();
    for (let i = 0; i < 3; i++) hub.broadcast({ type: "heartbeat", at: i });
    const cursor = `${hub.bootId}:1`;
    const res = await app.request("/api/events", { headers: { "Last-Event-ID": cursor } });
    // Broadcast while the handler is still writing hello/replay: must arrive after the replayed frames, once.
    hub.broadcast({ type: "heartbeat", at: 99 });
    const reader = res.body!.getReader();
    let text = "";
    const deadline = Date.now() + 2000;
    while (!text.includes('"at":99') && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    await reader.cancel();
    const ids = [...text.matchAll(/^id: (.+)$/gm)].map((m) => m[1] ?? "");
    expect(ids.map((id) => hub.sequenceOf(id))).toEqual([2, 3, 4, 5].slice(0, ids.length));
    expect(ids.length).toBeGreaterThanOrEqual(3);

    const slow = new SseHub();
    const stuck = { send: () => { throw new Error("slow reader during replay"); }, close: vi.fn() };
    slow.add(stuck);
    slow.broadcast({ type: "heartbeat", at: 1 });
    expect(slow.size).toBe(0);
    expect(stuck.close).toHaveBeenCalled();
  });

  it("snapshot exposes the SSE cursor", async () => {
    const { app, hub } = make();
    hub.broadcast({ type: "heartbeat", at: 1 });
    const res = await app.request("/api/snapshot?tracks=0", { headers: { Origin: "https://vakt.example" } });
    expect(res.headers.get("x-event-id")).toBe(hub.lastId);
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
