import { BW_TOKEN_URL, type BarentsWatchConfig } from "../../config";
import { logger } from "../../log";

const log = logger("bw.token");

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

/** Client-credentials token with caching, early refresh and single-flight fetches. */
export class TokenProvider {
  private token: string | null = null;
  private expiresAt = 0;
  private inflight: Promise<string> | null = null;

  constructor(
    private cfg: BarentsWatchConfig,
    private fetchImpl: typeof fetch = fetch,
    private now: () => number = Date.now,
  ) {}

  async get(): Promise<string> {
    if (this.token && this.now() < this.expiresAt) return this.token;
    if (!this.inflight) {
      this.inflight = this.refresh().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  invalidate(): void {
    this.token = null;
    this.expiresAt = 0;
  }

  private async refresh(): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
      scope: "ais",
      grant_type: "client_credentials",
    });
    const res = await this.fetchImpl(BW_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await res.json().catch(() => ({}))) as TokenResponse;
    if (!res.ok || !json.access_token) {
      const reason = json.error ?? `HTTP ${res.status}`;
      log.warn("token refresh failed", { reason });
      throw new Error(`BarentsWatch token: ${reason}`);
    }
    this.token = json.access_token;
    // Refresh a minute early so a request never races the expiry.
    this.expiresAt = this.now() + Math.max(60, (json.expires_in ?? 3600) - 60) * 1000;
    log.debug("token refreshed", { expiresIn: json.expires_in });
    return this.token;
  }
}
