import { describe, expect, it, vi } from "vitest";
import { TokenProvider } from "../src/sources/barentswatch/token";

function fetchWith(responses: Array<{ status: number; body: unknown }>) {
  let i = 0;
  const calls: string[] = [];
  const f = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(init?.body));
    const r = responses[Math.min(i++, responses.length - 1)]!;
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
  return { f: f as unknown as typeof fetch, calls };
}

describe("TokenProvider", () => {
  it("caches and refreshes a minute before expiry", async () => {
    let now = 0;
    const { f, calls } = fetchWith([{ status: 200, body: { access_token: "t1", expires_in: 3600 } }, { status: 200, body: { access_token: "t2", expires_in: 3600 } }]);
    const tp = new TokenProvider({ clientId: "a:b", clientSecret: "s" }, f, () => now);
    expect(await tp.get()).toBe("t1");
    expect(await tp.get()).toBe("t1");
    now = 3540 * 1000 + 1;
    expect(await tp.get()).toBe("t2");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("scope=ais");
    expect(calls[0]).toContain("client_id=a%3Ab");
  });
  it("shares one in-flight refresh and surfaces errors", async () => {
    const { f } = fetchWith([{ status: 400, body: { error: "invalid_scope" } }]);
    const tp = new TokenProvider({ clientId: "a", clientSecret: "s" }, f);
    const results = await Promise.allSettled([tp.get(), tp.get()]);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect((results[0] as PromiseRejectedResult).reason.message).toContain("invalid_scope");
    expect(f).toHaveBeenCalledTimes(1);
  });
});
