"use client";
import { useEffect } from "react";
import { coerceSettings, DEFAULT_SETTINGS, parseSettings, serializeSettings, type Settings } from "@vakt/domain";
import type { FleetStore } from "@/lib/fleetStore";

export const SETTINGS_KEY = "vakt.settings.v1";
const SETTINGS_PARAMS = ["src", "reticle", "wake", "cluster", "clusterPx", "trails", "fleet"];

function readStored(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? coerceSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Precedence: URL > localStorage > defaults. Writes both on change (URL keeps only non-defaults). */
export function useSettings(store: FleetStore): void {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const settings = parseSettings((k) => params.get(k), readStored());
    store.setState({ settings, settingsReady: true });

    let last = settings;
    return store.subscribe(() => {
      const next = store.getState().settings;
      if (next === last) return;
      last = next;
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* storage may be unavailable; URL still carries the state */
      }
      const url = new URL(window.location.href);
      for (const k of SETTINGS_PARAMS) url.searchParams.delete(k);
      for (const [k, v] of Object.entries(serializeSettings(next))) url.searchParams.set(k, v);
      window.history.replaceState(window.history.state, "", url.toString());
    });
  }, [store]);
}
