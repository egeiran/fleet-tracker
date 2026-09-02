import { describe, expect, it } from "vitest";
import { ndjson } from "../src/sources/barentswatch/ndjson";

function stream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(ctrl) {
      for (const c of chunks) ctrl.enqueue(enc.encode(c));
      ctrl.close();
    },
  });
}

async function collect(s: ReadableStream<Uint8Array>, bad: string[] = []) {
  const out: unknown[] = [];
  for await (const o of ndjson(s, (l) => bad.push(l))) out.push(o);
  return out;
}

describe("ndjson", () => {
  it("splits lines across chunk boundaries and handles CRLF", async () => {
    const out = await collect(stream(['{"a":1}\r\n{"b"', ':2}\n\n{"c":3}']));
    expect(out).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });
  it("skips malformed lines and reports them", async () => {
    const bad: string[] = [];
    const out = await collect(stream(['{"a":1}\nnot json\n{"b":2}\n']), bad);
    expect(out).toEqual([{ a: 1 }, { b: 2 }]);
    expect(bad).toEqual(["not json"]);
  });
  it("handles multi-byte characters split across chunks", async () => {
    const enc = new TextEncoder().encode('{"name":"SJØ"}\n');
    const s = new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(enc.slice(0, 11));
        ctrl.enqueue(enc.slice(11));
        ctrl.close();
      },
    });
    expect(await collect(s)).toEqual([{ name: "SJØ" }]);
  });
});
