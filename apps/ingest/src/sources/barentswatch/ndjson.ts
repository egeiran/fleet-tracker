/** Splits a byte stream into parsed JSON objects, one per line. Malformed lines are skipped. */
export async function* ndjson(
  body: ReadableStream<Uint8Array>,
  onBadLine?: (line: string) => void,
): AsyncGenerator<unknown> {
  const decoder = new TextDecoder("utf-8");
  const reader = body.getReader();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl = buf.indexOf("\n");
      while (nl >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, "").trim();
        buf = buf.slice(nl + 1);
        if (line) yield* parseLine(line, onBadLine);
        nl = buf.indexOf("\n");
      }
    }
    buf += decoder.decode();
    const rest = buf.trim();
    if (rest) yield* parseLine(rest, onBadLine);
  } finally {
    reader.releaseLock();
  }
}

function* parseLine(line: string, onBadLine?: (line: string) => void): Generator<unknown> {
  try {
    yield JSON.parse(line);
  } catch {
    onBadLine?.(line);
  }
}
