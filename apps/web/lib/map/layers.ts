import type { FeatureCollection } from "geojson";
import type { Map as MlMap } from "maplibre-gl";
import { REF_LAYER_ID, REF_SOURCE_ID, TILE_REF } from "./style";

export const TRAILS_SOURCE = "trails";
export const WAKE_SOURCE = "wake";
export const TRAIL_LAYERS = ["trails-line", "trails-rail", "trails-road"] as const;
export const WAKE_LAYERS = ["wake-moving", "wake-alert"] as const;

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Idempotent: safe to call on load and after style changes. Callers only invoke this once the
 * style has loaded; `isStyleLoaded()` is deliberately not used because it also reports false
 * while raster tiles are merely in flight.
 */
export function installLayers(map: MlMap): boolean {
  if (!map.getStyle()) return false;
  if (!map.getSource(TRAILS_SOURCE)) map.addSource(TRAILS_SOURCE, { type: "geojson", data: EMPTY });

  // One layer per transport mode: sea solid, rail dashed, road dotted.
  const dash: Record<(typeof TRAIL_LAYERS)[number], number[] | null> = {
    "trails-line": null,
    "trails-rail": [1.6, 1.3],
    "trails-road": [0.1, 2],
  };
  const mode: Record<(typeof TRAIL_LAYERS)[number], string> = {
    "trails-line": "sjø",
    "trails-rail": "bane",
    "trails-road": "vei",
  };
  for (const id of TRAIL_LAYERS) {
    if (map.getLayer(id)) continue;
    const road = id === "trails-road";
    map.addLayer({
      id,
      type: "line",
      source: TRAILS_SOURCE,
      filter: ["==", ["get", "mode"], mode[id]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["get", "color"],
        "line-width": ["case", ["get", "sel"], road ? 3 : 2.2, road ? 1.8 : 1.1],
        "line-opacity": ["case", ["get", "sel"], 0.95, 0.24],
        ...(dash[id] ? { "line-dasharray": dash[id] } : {}),
      },
    });
  }

  // Wake: line-gradient needs lineMetrics and fixed colour stops, hence one layer per status.
  if (!map.getSource(WAKE_SOURCE)) map.addSource(WAKE_SOURCE, { type: "geojson", lineMetrics: true, data: EMPTY });
  const wakes: Record<(typeof WAKE_LAYERS)[number], [string, string]> = {
    "wake-moving": ["moving", "203,242,77"],
    "wake-alert": ["alert", "255,122,82"],
  };
  for (const id of WAKE_LAYERS) {
    if (map.getLayer(id)) continue;
    const [status, rgb] = wakes[id];
    map.addLayer({
      id,
      type: "line",
      source: WAKE_SOURCE,
      filter: ["==", ["get", "status"], status],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-width": ["case", ["get", "hot"], 4, 2.6],
        "line-blur": 0.4,
        "line-gradient": [
          "interpolate",
          ["linear"],
          ["line-progress"],
          0,
          `rgba(${rgb},0)`,
          0.55,
          `rgba(${rgb},0.35)`,
          1,
          `rgba(${rgb},0.95)`,
        ],
      },
    });
  }
  return true;
}

/** Place-name tiles are toggled by adding/removing a raster layer under the trails. */
export function setReferenceLayer(map: MlMap, on: boolean): void {
  if (!map.getStyle()) return;
  const has = !!map.getLayer(REF_LAYER_ID);
  if (on && !has) {
    if (!map.getSource(REF_SOURCE_ID)) map.addSource(REF_SOURCE_ID, { type: "raster", tileSize: 256, tiles: [TILE_REF] });
    const before = map.getLayer(TRAIL_LAYERS[0]) ? TRAIL_LAYERS[0] : undefined;
    map.addLayer({ id: REF_LAYER_ID, type: "raster", source: REF_SOURCE_ID, paint: { "raster-opacity": 0.5 } }, before);
  } else if (!on && has) {
    map.removeLayer(REF_LAYER_ID);
    if (map.getSource(REF_SOURCE_ID)) map.removeSource(REF_SOURCE_ID);
  }
}
