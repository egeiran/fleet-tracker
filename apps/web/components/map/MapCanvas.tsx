"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useRef } from "react";
import { useFleetMap } from "@/hooks/useFleetMap";
import { useFleetStore } from "@/hooks/useFleetStore";
import { useReticle, useReticleRefs } from "@/hooks/useReticle";
import { ClusterHoverList } from "./ClusterHoverList";
import { Legend } from "./Legend";
import { MapControls } from "./MapControls";
import { ReticleOverlay } from "./ReticleOverlay";
import styles from "./MapCanvas.module.css";

/** Client-only: owns the MapLibre container plus the imperative overlays (reticle, cluster list). */
export default function MapCanvas() {
  const store = useFleetStore();
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useFleetMap(mapRef, store);
  const refs = useReticleRefs();
  useReticle(mapRef, rootRef, ctrlRef, refs, store);

  return (
    <div ref={rootRef} className={styles.root} data-reticle="off">
      <div ref={mapRef} className={styles.map} role="region" aria-label="Kart over flåten" data-testid="map" />
      <ReticleOverlay refs={refs} />
      <ClusterHoverList refs={refs} />
      <Legend />
      <MapControls ctrlRef={ctrlRef} />
    </div>
  );
}
