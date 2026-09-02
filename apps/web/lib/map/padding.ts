import type { PaddingOptions } from "maplibre-gl";

/** Glass panels float over the map, so framing must keep the fleet inside the visible field. */
export function padFor(rail: boolean, detailOpen: boolean, size: { width: number; height: number }): PaddingOptions {
  const pad = { top: 86, bottom: 132, left: rail ? 322 : 40, right: detailOpen ? 372 : 60 };
  // MapLibre throws when padding exceeds the canvas; clamp so small windows still frame.
  const maxX = Math.max(0, size.width - 200);
  const maxY = Math.max(0, size.height - 120);
  if (pad.left + pad.right > maxX) {
    const k = maxX / (pad.left + pad.right);
    pad.left = Math.floor(pad.left * k);
    pad.right = Math.floor(pad.right * k);
  }
  if (pad.top + pad.bottom > maxY) {
    const k = maxY / (pad.top + pad.bottom);
    pad.top = Math.floor(pad.top * k);
    pad.bottom = Math.floor(pad.bottom * k);
  }
  return pad;
}
