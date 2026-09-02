import { Agent } from "undici";
import { bboxToPolygon, type AisMessage, type Bbox } from "@vakt/domain";
import { BW_HISTORIC_URL, BW_LIVE_URL, SEA_SHIP_TYPES } from "../../config";
import type { TokenProvider } from "./token";

export interface AreaFilter {
  bbox: Bbox;
  shipTypes?: number[];
}

/** Undici's default bodyTimeout (300 s) would kill the never-ending stream; disable it for that call only. */
const streamAgent = new Agent({ bodyTimeout: 0, headersTimeout: 30_000 });

export class BarentsWatchClient {
  constructor(
    private tokens: TokenProvider,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async authed(url: string, init: Omit<RequestInit, "dispatcher"> & { dispatcher?: unknown }, retry = true): Promise<Response> {
    const token = await this.tokens.get();
    const res = await this.fetchImpl(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    } as unknown as RequestInit);
    if (res.status === 401 && retry) {
      this.tokens.invalidate();
      return this.authed(url, init, false);
    }
    return res;
  }

  /** Snapshot of the latest position per vessel inside the area. */
  async latestInArea(filter: AreaFilter): Promise<AisMessage[]> {
    const res = await this.authed(`${BW_LIVE_URL}/v1/latest/combined`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelType: "Full",
        modelFormat: "Json",
        shipTypes: filter.shipTypes ?? SEA_SHIP_TYPES,
        geometry: bboxToPolygon(filter.bbox),
      }),
    });
    if (!res.ok) throw new Error(`latest/combined ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as AisMessage[];
  }

  /** Positions for the last 24 h. Returned unsorted by the API; caller sorts. */
  async tracksLast24h(mmsi: number): Promise<{ status: number; retryAfterMs: number | null; data: AisMessage[] }> {
    const res = await this.authed(`${BW_HISTORIC_URL}/v1/historic/trackslast24hours/${mmsi}?modelFormat=Json`, { method: "GET" });
    const retryAfter = res.headers.get("retry-after");
    const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : null;
    if (!res.ok) return { status: res.status, retryAfterMs, data: [] };
    return { status: res.status, retryAfterMs, data: (await res.json()) as AisMessage[] };
  }

  /** Never-ending NDJSON stream for the area; caller iterates `body` and aborts via `signal`. */
  async openStream(filter: AreaFilter, since: string | null, signal: AbortSignal): Promise<Response> {
    const body: Record<string, unknown> = {
      modelType: "Full",
      modelFormat: "Json",
      shipTypes: filter.shipTypes ?? SEA_SHIP_TYPES,
      geometry: bboxToPolygon(filter.bbox),
      downsample: true,
    };
    if (since) body.since = since;
    const res = await this.authed(`${BW_LIVE_URL}/v1/combined`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
      dispatcher: streamAgent,
    });
    if (!res.ok || !res.body) throw new Error(`combined stream ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return res;
  }
}
