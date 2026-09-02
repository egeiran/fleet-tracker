"use client";
import { useEffect } from "react";
import { actions, type ConnStatus, type FleetStore } from "@/lib/fleetStore";
import { createProvider } from "@/lib/providers";
import { useFleetSelector } from "./useFleetStore";

/** Creates the data provider for the chosen source and feeds the store. StrictMode-safe. */
export function useProvider(store: FleetStore): void {
  const ready = useFleetSelector((s) => s.settingsReady);
  const source = useFleetSelector((s) => s.settings.source);
  const fleetSize = useFleetSelector((s) => s.settings.fleetSize);

  useEffect(() => {
    if (!ready) return;
    const provider = createProvider({ ...store.getState().settings, source, fleetSize });
    store.setState({ provider, conn: source === "live" ? "connecting" : "mock" });
    const unsubSnap = provider.subscribe((snap) => {
      actions.setFleet(store, snap.units, snap.window);
      store.setState({ coverage: snap.coverage, attribution: snap.attribution });
    });
    const unsubStatus = provider.onStatus((status, at) => {
      store.setState({ conn: status as ConnStatus, lastUpdate: at });
    });
    provider.start();
    return () => {
      unsubSnap();
      unsubStatus();
      provider.stop();
      if (store.getState().provider === provider) store.setState({ provider: null });
    };
  }, [store, ready, source, fleetSize]);
}
