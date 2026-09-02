import { describe, expect, it } from "vitest";
import { createApp } from "../src/api/app";
import { SseHub } from "../src/api/sseHub";
import { loadConfig } from "../src/config";
import { FleetService } from "../src/core/service";
import { openDb } from "../src/db/sqlite";

function make() {
  const config = loadConfig({ FLEET_SEA: "1", FLEET_RAIL: "1", FLEET_ROAD: "2", CORS_ORIGINS: "https://vakt.example" });
  const service = new FleetService({ db: openDb(":memory:"), config });
  service.boot();
  const hub = new SseHub();
  service.onEvent((e) => hub.broadcast(e));
  const app = createApp({ config, service, hub, health: () => ({ uptimeSec: 1, db: { path: ":memory:", positions: 0, sizeBytes: 0 }, stream: { connected: false, reconnects: 0, linesPerMin: 0 } }) });
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
    const res = await app.request("/api/events", { headers: { "Last-Event-ID": "1" } });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("event: hello");
    await reader.cancel();
    expect(hub.replayAfter("1")!.map((m) => m.id)).toEqual(["2"]);
    expect(hub.replayAfter("nope")).toBeNull();
  });
});
