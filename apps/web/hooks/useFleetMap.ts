"use client";
import { useEffect, useRef, type RefObject } from "react";
import { bboxOf, CLUSTER_MAX_ZOOM, HOME_BOUNDS, padBbox, SELECT_ZOOM, type LngLat } from "@vakt/domain";
import { getWorkerUrl, Map as MlMap, setWorkerUrl, type ErrorEvent as MlErrorEvent } from "maplibre-gl";
import { actions, type FleetStore } from "@/lib/fleetStore";
import { cubicOut } from "@/lib/map/easing";
import { installLayers, setReferenceLayer } from "@/lib/map/layers";
import {
  createClusterSlot,
  createUnitMarker,
  removeUnitMarker,
  updateUnitMarkerIdentity,
  type ClusterSlot,
  type UnitMarker,
} from "@/lib/map/markers";
import { padFor } from "@/lib/map/padding";
import { attributionFor, baseStyle } from "@/lib/map/style";
import { syncMap } from "@/lib/map/sync";

export interface MapController {
  map: MlMap | null;
  markers: Map<string, UnitMarker>;
  clusterPool: ClusterSlot[];
  hoverCluster: number | null;
  shownCount: number;
  ready: boolean;
  queueSync: () => void;
  sync: () => void;
  setHoverCluster: (i: number | null) => void;
  fitAll: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToMembers: (members: { pos: LngLat }[]) => void;
}

const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

function size(el: HTMLElement) {
  return { width: el.clientWidth, height: el.clientHeight };
}

/**
 * Owns the MapLibre instance, the marker/cluster pools and the single imperative sync pass.
 * Nothing here is React state; the store is read imperatively on every sync.
 */
function makeController(): MapController {
  return {
    map: null,
    markers: new Map(),
    clusterPool: [],
    hoverCluster: null,
    shownCount: 0,
    ready: false,
    queueSync: () => {},
    sync: () => {},
    setHoverCluster: () => {},
    fitAll: () => {},
    zoomIn: () => {},
    zoomOut: () => {},
    zoomToMembers: () => {},
  };
}

export function useFleetMap(containerRef: RefObject<HTMLDivElement | null>, store: FleetStore): RefObject<MapController> {
  const ctrlRef = useRef<MapController | null>(null);
  if (ctrlRef.current == null) ctrlRef.current = makeController();

  useEffect(() => {
    const el = containerRef.current;
    const ctrl = ctrlRef.current;
    if (!el || !ctrl) return;
    const state0 = store.getState();
    const durations = () => (store.getState().reducedMotion ? 0 : 1);
    const pad = () => {
      const s = store.getState();
      return padFor(s.rail, !!s.sel, size(el));
    };

    // MapLibre 6 loads its worker from a sibling module; serve it from /public (scripts/copy-maplibre-worker.mjs).
    if (getWorkerUrl() !== MAPLIBRE_WORKER_URL) setWorkerUrl(MAPLIBRE_WORKER_URL);
    const map = new MlMap({
      container: el,
      style: baseStyle(attributionFor(state0.settings.source)),
      bounds: HOME_BOUNDS,
      fitBoundsOptions: { padding: pad() },
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    map.keyboard.disable();
    ctrl.map = map;
    if (process.env.NODE_ENV !== "production") {
      // Handy for poking at the map from the console during development.
      (window as unknown as { __vaktMap?: MlMap }).__vaktMap = map;
    }

    let queued = false;
    const sync = () => {
      if (!ctrl.ready || !ctrl.map) return;
      const res = syncMap({
        map,
        state: store.getState(),
        markers: ctrl.markers,
        clusterPool: ctrl.clusterPool,
        ensureClusterSlot,
        hoverCluster: ctrl.hoverCluster,
      });
      ctrl.shownCount = res.shownCount;
    };
    const queueSync = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        sync();
      });
    };
    ctrl.sync = sync;
    ctrl.queueSync = queueSync;

    const handlers = {
      onHover: (id: string | null) => actions.setHover(store, id),
      onSelect: (id: string) => select(id),
    };
    const ensureClusterSlot = (i: number): ClusterSlot => {
      let slot = ctrl.clusterPool[i];
      if (!slot) {
        slot = createClusterSlot(map, i, {
          onHover: (idx) => ctrl.setHoverCluster(idx),
          onClick: (idx) => {
            const s = ctrl.clusterPool[idx];
            if (s && s.members.length) ctrl.zoomToMembers(s.members);
          },
        });
        ctrl.clusterPool[i] = slot;
      }
      return slot;
    };
    ctrl.setHoverCluster = (i) => {
      if (ctrl.hoverCluster === i) return;
      ctrl.hoverCluster = i;
      sync();
    };

    const reconcileMarkers = () => {
      const { fleet, byId } = store.getState();
      for (const [id, m] of ctrl.markers) {
        if (!byId.has(id)) {
          removeUnitMarker(m);
          ctrl.markers.delete(id);
        }
      }
      for (const u of fleet) {
        const existing = ctrl.markers.get(u.id);
        if (existing) updateUnitMarkerIdentity(existing, u.mode, u.status, u.id);
        else ctrl.markers.set(u.id, createUnitMarker(map, u, handlers));
      }
    };

    // Selection from any origin (marker, list, deep link) eases the camera via the subscription below.
    const select = (id: string) => {
      if (store.getState().byId.has(id)) actions.select(store, id);
    };

    ctrl.fitAll = () => {
      actions.select(store, null);
      map.fitBounds(HOME_BOUNDS, { padding: pad(), duration: 1100 * durations() });
    };
    ctrl.zoomIn = () => map.zoomIn({ duration: 500 * durations() });
    ctrl.zoomOut = () => map.zoomOut({ duration: 500 * durations() });
    ctrl.zoomToMembers = (members) => {
      const b = bboxOf(members.map((m) => m.pos));
      if (!b) return;
      map.fitBounds(padBbox(b), { padding: pad(), maxZoom: CLUSTER_MAX_ZOOM, duration: 900 * durations(), essential: true });
    };

    const init = () => {
      if (ctrl.ready) return;
      map.resize();
      installLayers(map);
      reconcileMarkers();
      ctrl.ready = true;
      sync();
      setReferenceLayer(map, store.getState().labels);
      el.dataset.mapReady = "true";
      store.setState({ mapReady: true });
    };
    map.on("load", init);
    map.on("style.load", () => {
      if (ctrl.ready) {
        installLayers(map);
        setReferenceLayer(map, store.getState().labels);
        sync();
      }
    });
    map.on("move", queueSync);
    map.on("error", (e: MlErrorEvent) => {
      // Tile errors are non-fatal; keep the console useful without spamming.
      if (process.env.NODE_ENV !== "production") console.debug("maplibre", e.error?.message ?? e);
    });

    const ro = new ResizeObserver(() => {
      map.resize();
      queueSync();
    });
    ro.observe(el);

    // Store subscription: sync on any change; react to identity-level changes.
    let prev = store.getState();
    const unsub = store.subscribe(() => {
      const s = store.getState();
      // setState notifies synchronously, so record `prev` before anything below re-enters the store.
      const before = prev;
      prev = s;
      if (s.fleet !== before.fleet && ctrl.ready) reconcileMarkers();
      if (s.labels !== before.labels && ctrl.ready) setReferenceLayer(map, s.labels);
      if (s.sel && s.sel !== before.sel && s.provider && ctrl.ready) {
        const u = s.byId.get(s.sel);
        if (u) {
          map.easeTo({
            center: s.provider.positionAt(u, s.t),
            zoom: Math.max(map.getZoom(), SELECT_ZOOM),
            offset: [-160, 0],
            duration: 1250 * durations(),
            easing: cubicOut,
          });
        }
      }
      if (s.pendingSel && ctrl.ready && s.fleet.length) {
        if (s.byId.has(s.pendingSel)) {
          const id = s.pendingSel;
          store.setState({ pendingSel: null });
          select(id);
        } else if (s.fleet !== before.fleet || !before.fleet.length) {
          store.setState({ pendingSel: null, toast: `Fant ikke enhet ${s.pendingSel}` });
        }
      }
      queueSync();
    });

    return () => {
      unsub();
      ro.disconnect();
      for (const m of ctrl.markers.values()) removeUnitMarker(m);
      ctrl.markers.clear();
      for (const slot of ctrl.clusterPool) slot.marker.remove();
      ctrl.clusterPool.length = 0;
      ctrl.ready = false;
      ctrl.map = null;
      delete el.dataset.mapReady;
      map.remove();
      store.setState({ mapReady: false });
    };
  }, [containerRef, store]);

  return ctrlRef as RefObject<MapController>;
}
