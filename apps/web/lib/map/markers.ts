import type { Mode, Status, Unit } from "@vakt/domain";
import { Marker, type Map as MlMap } from "maplibre-gl";

export interface UnitMarker {
  marker: Marker;
  host: HTMLDivElement;
  inner: HTMLDivElement;
  dot: HTMLDivElement;
  ring: HTMLDivElement;
  label: HTMLDivElement;
  abort: AbortController;
}

export interface ClusterSlot {
  marker: Marker;
  host: HTMLDivElement;
  inner: HTMLDivElement;
  disc: HTMLDivElement;
  members: { id: string; pos: [number, number] }[];
  pos: [number, number] | null;
  alert: number;
}

export interface MarkerHandlers {
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

function shell(hostClass: string, innerClass: string) {
  const host = document.createElement("div");
  host.className = hostClass;
  host.setAttribute("aria-hidden", "true");
  const inner = document.createElement("div");
  inner.className = innerClass;
  host.appendChild(inner);
  return { host, inner };
}

export function createUnitMarker(map: MlMap, unit: Unit, h: MarkerHandlers): UnitMarker {
  const { host, inner } = shell("mk-host", "mk-inner");
  const ring = document.createElement("div");
  ring.className = "mk-ring";
  const dot = document.createElement("div");
  dot.className = "mk-dot";
  dot.dataset.mode = unit.mode;
  dot.dataset.status = unit.status;
  const label = document.createElement("div");
  label.className = "mk-label";
  label.textContent = `${unit.id} · ${unit.mode}`;
  inner.append(ring, dot, label);

  const abort = new AbortController();
  const { signal } = abort;
  inner.addEventListener("mouseenter", () => h.onHover(unit.id), { signal });
  inner.addEventListener("mouseleave", () => h.onHover(null), { signal });
  inner.addEventListener(
    "click",
    (e) => {
      e.stopPropagation();
      h.onSelect(unit.id);
    },
    { signal },
  );
  const marker = new Marker({ element: host, anchor: "center" }).setLngLat(unit.position).addTo(map);
  return { marker, host, inner, dot, ring, label, abort };
}

export function updateUnitMarkerIdentity(m: UnitMarker, mode: Mode, status: Status, id: string): void {
  if (m.dot.dataset.mode !== mode) m.dot.dataset.mode = mode;
  if (m.dot.dataset.status !== status) m.dot.dataset.status = status;
  const text = `${id} · ${mode}`;
  if (m.label.textContent !== text) m.label.textContent = text;
}

export function removeUnitMarker(m: UnitMarker): void {
  m.abort.abort();
  m.marker.remove();
}

export interface ClusterHandlers {
  onHover: (index: number | null) => void;
  onClick: (index: number) => void;
}

export function createClusterSlot(map: MlMap, index: number, h: ClusterHandlers): ClusterSlot {
  const { host, inner } = shell("cl-host", "cl-inner");
  const disc = document.createElement("div");
  disc.className = "cl-disc";
  inner.appendChild(disc);
  inner.addEventListener("click", (e) => {
    e.stopPropagation();
    h.onClick(index);
  });
  inner.addEventListener("mouseenter", () => h.onHover(index));
  inner.addEventListener("mouseleave", () => h.onHover(null));
  const marker = new Marker({ element: host, anchor: "center" }).setLngLat([0, 0]).addTo(map);
  host.style.display = "none";
  return { marker, host, inner, disc, members: [], pos: null, alert: 0 };
}
