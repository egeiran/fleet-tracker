import { DAY_MS } from "./constants";
import type { TimeWindow } from "./types";

/** Hours back from "now" for slider position t (0–100), matching the prototype rounding. */
export function hoursBack(t: number): number {
  return Math.round((100 - t) * 0.24);
}

export function tLabel(t: number): string {
  const h = hoursBack(t);
  return h === 0 ? "nå" : `−${h} t`;
}

export function timeAt(window: TimeWindow, t: number): number {
  return window.from + ((window.to - window.from) * t) / 100;
}

export function windowEndingAt(to: number): TimeWindow {
  return { from: to - DAY_MS, to };
}

const clockCache = new Map<string, Intl.DateTimeFormat>();
function clockFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = clockCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("nb-NO", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    clockCache.set(timeZone, f);
  }
  return f;
}

/** "HH:MM" in the given zone. */
export function formatClock(ms: number, timeZone = "Europe/Oslo"): string {
  return clockFormatter(timeZone).format(new Date(ms)).replace(".", ":");
}

export function formatClockSeconds(ms: number, timeZone = "Europe/Oslo"): string {
  return new Intl.DateTimeFormat("nb-NO", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(ms))
    .replace(/\./g, ":");
}

const dayCache = new Map<string, Intl.DateTimeFormat>();
function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = dayCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dayCache.set(timeZone, f);
  }
  return f;
}

/** "HH:MM" today, "i går HH:MM" yesterday, otherwise "DD.MM HH:MM" — all in the given zone. */
export function formatEventTime(ms: number, now: number, timeZone = "Europe/Oslo"): string {
  const clock = formatClock(ms, timeZone);
  const day = dayFormatter(timeZone).format(new Date(ms));
  const today = dayFormatter(timeZone).format(new Date(now));
  if (day === today) return clock;
  // Compare calendar days (not a fixed 24 h) so DST transitions do not shift "yesterday".
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  const [dy, dm, dd] = day.split("-").map(Number) as [number, number, number];
  const diffDays = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(dy, dm - 1, dd)) / DAY_MS);
  if (diffDays === 1) return `i går ${clock}`;
  if (diffDays < 0) return clock;
  const [, m, d] = day.split("-");
  return `${d}.${m} ${clock}`;
}
