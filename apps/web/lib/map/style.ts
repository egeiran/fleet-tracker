import type { StyleSpecification } from "maplibre-gl";

/** Esri canvas tiles: no key, no watermark. Check the licence terms before commercial use. */
export const TILE_BASE =
  "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
export const TILE_REF =
  "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}";

export const REF_SOURCE_ID = "ref";
export const REF_LAYER_ID = "ref";

export function attributionFor(source: "mock" | "live"): string {
  return source === "live"
    ? "Fliser © Esri · Data: Kystverket/BarentsWatch, Entur (NLOD)"
    : "Fliser © Esri · mockdata";
}

export function baseStyle(attribution: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      base: { type: "raster", tileSize: 256, tiles: [TILE_BASE], attribution },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#0A0C0B" } },
      {
        id: "base",
        type: "raster",
        source: "base",
        paint: {
          "raster-opacity": 0.62,
          "raster-saturation": -0.6,
          "raster-contrast": 0.12,
          "raster-brightness-max": 0.86,
        },
      },
    ],
  };
}
