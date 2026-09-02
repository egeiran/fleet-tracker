"use client";
import type { RefObject } from "react";
import type { MapController } from "@/hooks/useFleetMap";
import { useFleetSelector, useFleetStore } from "@/hooks/useFleetStore";
import { selectContentLeft, selectCtrlTop } from "@/lib/selectors";
import styles from "./MapControls.module.css";

export function MapControls({ ctrlRef }: { ctrlRef: RefObject<MapController> }) {
  const store = useFleetStore();
  const left = useFleetSelector(selectContentLeft);
  const top = useFleetSelector(selectCtrlTop);
  const labels = useFleetSelector((s) => s.labels);
  return (
    <div className={styles.tray} style={{ left, top }} role="group" aria-label="Kartkontroller">
      <button type="button" className={styles.btn} onClick={() => ctrlRef.current.fitAll()} title="Vis hele flåten" aria-label="Vis hele flåten">
        <span className={styles.fitIcon} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={labels ? styles.btnOn : styles.btnMono}
        onClick={() => store.setState({ labels: !labels })}
        title="Stedsnavn av/på"
        aria-label="Stedsnavn"
        aria-pressed={labels}
      >
        ABC
      </button>
      <button type="button" className={styles.btnZoom} onClick={() => ctrlRef.current.zoomIn()} aria-label="Zoom inn">
        +
      </button>
      <button type="button" className={styles.btnZoom} onClick={() => ctrlRef.current.zoomOut()} aria-label="Zoom ut">
        −
      </button>
    </div>
  );
}
