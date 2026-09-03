import {
  gridCluster,
  matches,
  sliceAt,
  trailAt,
  TRAIL_MIN_ZOOM,
  WAKE_LEN,
  type LngLat,
  type ProjectedUnit,
  type Unit,
} from "@vakt/domain";
import type { Feature } from "geojson";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import type { FleetState } from "../fleetStore";
import { installLayers, TRAILS_SOURCE, WAKE_SOURCE } from "./layers";
import type { ClusterSlot, UnitMarker } from "./markers";

const TONE: Record<Unit["status"], string> = { alert: "#FF7A52", moving: "#CBF24D", idle: "#8A928C" };

export interface SyncContext {
  map: MlMap;
  state: FleetState;
  markers: Map<string, UnitMarker>;
  clusterPool: ClusterSlot[];
  ensureClusterSlot: (i: number) => ClusterSlot;
  hoverCluster: number | null;
}

export interface SyncResult {
  shownCount: number;
  clusterCount: number;
}

/**
 * Single imperative pass: positions, clustering, marker attributes, trails and wakes.
 * Runs on map move (rAF-throttled), on every state change and on each playback tick.
 */
export function syncMap(ctx: SyncContext): SyncResult {
  const { map, state, markers, clusterPool } = ctx;
  const provider = state.provider;
  if (!provider) return { shownCount: 0, clusterCount: 0 };
  const { settings, filters, sel, hover, t, playing } = state;
  const clusterOn = settings.clustering && !filters.q.trim() && !playing;
  const zoom = map.getZoom();

  const live: { u: Unit; pos: LngLat }[] = [];
  const visible = new Set<string>();
  for (const u of state.fleet) {
    const pos = provider.positionAt(u, t);
    if (matches(u, filters)) {
      visible.add(u.id);
      live.push({ u, pos });
    }
    markers.get(u.id)?.marker.setLngLat(pos);
  }

  let clustered = new Set<string>();
  let clusters: ReturnType<typeof gridCluster>["clusters"] = [];
  if (clusterOn) {
    const projected: ProjectedUnit[] = live.map(({ u, pos }) => {
      const p = map.project(pos);
      return { id: u.id, x: p.x, y: p.y, status: u.status, pos };
    });
    const res = gridCluster(projected, settings.clusterPx, sel);
    clustered = res.clusteredIds;
    clusters = res.clusters;
  }

  const trailMode = settings.trails;
  const wakeOn = settings.wake;
  const wakeLen = playing ? WAKE_LEN.playing : WAKE_LEN.normal;
  const feats: Feature[] = [];
  const wakeFeats: Feature[] = [];

  for (const u of state.fleet) {
    const m = markers.get(u.id);
    if (!m) continue;
    const on = visible.has(u.id);
    const isSel = sel === u.id;
    const isHot = isSel || hover === u.id;
    const hidden = !on || clustered.has(u.id);

    setAttr(m.inner, "data-hidden", hidden && on ? "1" : null);
    setAttr(m.inner, "data-dim", !on ? "1" : null);
    setAttr(m.inner, "data-hot", isHot && !hidden ? "1" : null);
    const z = isHot ? "6" : "1";
    if (m.host.style.zIndex !== z) m.host.style.zIndex = z;
    const pe = hidden ? "none" : "auto";
    if (m.host.style.pointerEvents !== pe) m.host.style.pointerEvents = pe;
    setAttr(m.ring, "data-pulse", u.status === "alert" && !hidden ? "1" : null);
    if (m.dot.dataset.status !== u.status) m.dot.dataset.status = u.status;

    const color = TONE[u.status];
    const path = provider.pathOf(u);
    const frac = provider.fracAt(u, t);
    const wantTrail =
      trailMode === "av"
        ? false
        : isHot
          ? true
          : trailMode === "valgt"
            ? false
            : hidden || u.status === "idle"
              ? false
              : trailMode === "alle"
                ? true
                : zoom >= TRAIL_MIN_ZOOM;
    if (wantTrail) {
      const tr = trailAt(path, frac);
      if (tr) {
        feats.push({
          type: "Feature",
          properties: { color, sel: isSel, mode: u.mode },
          geometry: { type: "LineString", coordinates: tr },
        });
      }
    }
    if (wakeOn && !hidden && u.status !== "idle" && path.length > 1) {
      const wk = sliceAt(path, frac - wakeLen, frac);
      if (wk) {
        wakeFeats.push({
          type: "Feature",
          properties: { status: u.status, hot: isHot },
          geometry: { type: "LineString", coordinates: wk },
        });
      }
    }
  }

  clusters.forEach((c, i) => {
    const slot = ctx.ensureClusterSlot(i);
    slot.members = c.members.map((m) => ({ id: m.id, pos: m.pos }));
    slot.pos = c.pos;
    slot.alert = c.alert;
    slot.marker.setLngLat(c.pos);
    if (slot.host.style.display !== "") slot.host.style.display = "";
    const hot = ctx.hoverCluster === i;
    slot.host.style.zIndex = hot ? "5" : "3";
    slot.host.style.pointerEvents = "auto";
    slot.inner.style.opacity = "1";
    setAttr(slot.inner, "data-hot", hot ? "1" : null);
    const n = String(c.n);
    if (slot.disc.textContent !== n) slot.disc.textContent = n;
    setAttr(slot.disc, "data-alert", c.alert ? "1" : null);
    setAttr(slot.disc, "data-moving", !c.alert && c.moving ? "1" : null);
  });
  for (let i = clusters.length; i < clusterPool.length; i++) {
    const slot = clusterPool[i]!;
    slot.members = [];
    slot.pos = null;
    slot.inner.style.opacity = "0";
    slot.host.style.pointerEvents = "none";
    slot.host.style.display = "none";
  }

  let src = map.getSource(TRAILS_SOURCE) as GeoJSONSource | undefined;
  if (!src) {
    installLayers(map);
    src = map.getSource(TRAILS_SOURCE) as GeoJSONSource | undefined;
  }
  src?.setData({ type: "FeatureCollection", features: feats });
  (map.getSource(WAKE_SOURCE) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: wakeFeats });

  return { shownCount: live.length, clusterCount: clusters.length };
}

function setAttr(el: HTMLElement, name: string, value: string | null): void {
  if (value === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) {
    el.setAttribute(name, value);
  }
}
