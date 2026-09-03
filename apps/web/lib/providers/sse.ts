/** EventSource wrapper with exponential backoff and a heartbeat watchdog. */
export interface SseHandlers {
  onEvent: (type: string, data: string, id: string | null) => void;
  onOpen: () => void;
  onStale: () => void;
  onOffline: () => void;
}

export interface SseClient {
  close: () => void;
}

const EVENT_TYPES = ["hello", "position", "status", "unit", "coverage", "resync", "heartbeat"];

export function openSse(url: string, h: SseHandlers, opts: { watchdogMs?: number; maxFailures?: number } = {}): SseClient {
  const watchdogMs = opts.watchdogMs ?? 45_000;
  const maxFailures = opts.maxFailures ?? 3;
  let es: EventSource | null = null;
  let closed = false;
  let failures = 0;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let lastId: string | null = null;

  const armWatchdog = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      h.onStale();
      reconnect();
    }, watchdogMs);
  };

  const connect = () => {
    if (closed) return;
    const u = new URL(url);
    if (lastId) u.searchParams.set("lastEventId", lastId);
    es = new EventSource(u.toString());
    es.onopen = () => {
      failures = 0;
      h.onOpen();
      armWatchdog();
    };
    es.onerror = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = null;
      es?.close();
      es = null;
      failures++;
      if (failures >= maxFailures) h.onOffline();
      scheduleReconnect();
    };
    for (const type of EVENT_TYPES) {
      es.addEventListener(type, (ev) => {
        const me = ev as MessageEvent<string>;
        if (me.lastEventId) lastId = me.lastEventId;
        armWatchdog();
        h.onEvent(type, me.data, me.lastEventId || null);
      });
    }
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return;
    const base = Math.min(30_000, 1000 * 2 ** Math.min(failures, 5));
    const delay = base / 2 + Math.random() * (base / 2);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const reconnect = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = null;
    es?.close();
    es = null;
    scheduleReconnect();
  };

  connect();
  return {
    close() {
      closed = true;
      if (watchdog) clearTimeout(watchdog);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
      es = null;
    },
  };
}
