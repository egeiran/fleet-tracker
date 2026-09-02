"use client";
import { createContext, useContext } from "react";
import type { FleetState, FleetStore } from "@/lib/fleetStore";
import { useStoreSelector } from "@/lib/store";

export const FleetStoreContext = createContext<FleetStore | null>(null);

export function useFleetStore(): FleetStore {
  const store = useContext(FleetStoreContext);
  if (!store) throw new Error("FleetStoreContext missing");
  return store;
}

export function useFleetSelector<R>(selector: (s: FleetState) => R): R {
  return useStoreSelector(useFleetStore(), selector);
}
