import type { LngLat } from "./types";

/** "59.913° N  10.752° Ø" for the reticle readout. */
export function coordReadout(lngLat: { lng: number; lat: number }): string {
  const lat = Math.abs(lngLat.lat).toFixed(3);
  const lng = Math.abs(lngLat.lng).toFixed(3);
  return `${lat}° ${lngLat.lat >= 0 ? "N" : "S"}  ${lng}° ${lngLat.lng >= 0 ? "Ø" : "V"}`;
}

/** "58,30° N 9,80° Ø" as used in the event log. */
export function coordLabel(p: LngLat): string {
  const lat = Math.abs(p[1]).toFixed(2).replace(".", ",");
  const lng = Math.abs(p[0]).toFixed(2).replace(".", ",");
  return `${lat}° ${p[1] >= 0 ? "N" : "S"} ${lng}° ${p[0] >= 0 ? "Ø" : "V"}`;
}

export function formatKnots(sog: number | undefined): string {
  if (sog == null) return "—";
  return `${sog.toFixed(1).replace(".", ",")} kn`;
}

export function formatDegrees(d: number | undefined): string {
  if (d == null) return "—";
  return `${Math.round(d)}°`;
}

export function formatDelay(sec: number | undefined): string {
  if (sec == null) return "—";
  const m = Math.round(sec / 60);
  if (m === 0) return "i rute";
  return m > 0 ? `+${m} min` : `${m} min`;
}
