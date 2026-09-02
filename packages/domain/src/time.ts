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
