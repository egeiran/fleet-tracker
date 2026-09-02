"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { FleetStoreContext } from "@/hooks/useFleetStore";
import { useInputModality, useReducedMotion } from "@/hooks/useInputModality";
import { useProvider } from "@/hooks/useProvider";
import { useSettings } from "@/hooks/useSettings";
import { actions, createFleetStore, type FleetStore } from "@/lib/fleetStore";
import { DetailPanel } from "./detail/DetailPanel";
import { Header } from "./header/Header";
import { FilterRail, RailPill } from "./rail/FilterRail";
import { Toast } from "./shared/Toast";
import { Timeline } from "./timeline/Timeline";
import styles from "./FleetMapApp.module.css";

const MapCanvas = dynamic(() => import("./map/MapCanvas"), {
  ssr: false,
  loading: () => <div className={styles.mapSkeleton} aria-hidden="true" />,
});

export function FleetMapApp({ initialSelectedId }: { initialSelectedId?: string }) {
  const [store] = useState<FleetStore>(() => createFleetStore({ pendingSel: initialSelectedId ?? null }));
  return (
    <FleetStoreContext.Provider value={store}>
      <Shell store={store} />
    </FleetStoreContext.Provider>
  );
}

function Shell({ store }: { store: FleetStore }) {
  useSettings(store);
  useProvider(store);
  useInputModality(store);
  useReducedMotion(store);
  useGlobalKeys(store);
  return (
    <div className={styles.root}>
      <Header />
      <main className={styles.main}>
        <FilterRail />
        <MapCanvas />
        <RailPill />
        <Timeline />
        <DetailPanel />
        <Toast />
        <LiveRegion store={store} />
      </main>
    </div>
  );
}

/** Escape closes the detail panel (settings handle their own Escape and stop propagation). */
function useGlobalKeys(store: FleetStore) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const s = store.getState();
      if (s.settingsOpen) return;
      if (s.sel) {
        const id = s.sel;
        actions.select(store, null);
        document.querySelector<HTMLElement>(`[role="option"][data-id="${CSS.escape(id)}"]`)?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);
}

function LiveRegion({ store }: { store: FleetStore }) {
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let prevSel = store.getState().sel;
    let prevPlaying = store.getState().playing;
    return store.subscribe(() => {
      const s = store.getState();
      if (s.sel !== prevSel) {
        prevSel = s.sel;
        if (s.sel) setMsg(`${s.sel} valgt`);
      }
      if (s.playing !== prevPlaying) {
        prevPlaying = s.playing;
        setMsg(s.playing ? "Avspilling startet" : "Avspilling stoppet");
      }
    });
  }, [store]);
  return (
    <div className="visually-hidden" aria-live="polite" role="status">
      {msg}
    </div>
  );
}
