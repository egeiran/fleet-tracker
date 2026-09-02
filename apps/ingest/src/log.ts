type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let threshold: Level = "info";
export function setLogLevel(level: Level): void {
  threshold = level;
}

export interface Logger {
  debug: (msg: string, data?: Record<string, unknown>) => void;
  info: (msg: string, data?: Record<string, unknown>) => void;
  warn: (msg: string, data?: Record<string, unknown>) => void;
  error: (msg: string, data?: Record<string, unknown>) => void;
}

function write(level: Level, scope: string, msg: string, data?: Record<string, unknown>): void {
  if (ORDER[level] < ORDER[threshold]) return;
  const line = { t: new Date().toISOString(), level, scope, msg, ...(data ?? {}) };
  const out = JSON.stringify(line);
  if (level === "error" || level === "warn") process.stderr.write(out + "\n");
  else process.stdout.write(out + "\n");
}

/** Small JSON logger; one line per event so Fly's log viewer stays greppable. */
export function logger(scope: string): Logger {
  return {
    debug: (m, d) => write("debug", scope, m, d),
    info: (m, d) => write("info", scope, m, d),
    warn: (m, d) => write("warn", scope, m, d),
    error: (m, d) => write("error", scope, m, d),
  };
}

export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
