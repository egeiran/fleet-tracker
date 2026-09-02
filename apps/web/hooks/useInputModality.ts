"use client";
import { useEffect } from "react";
import type { FleetStore } from "@/lib/fleetStore";

const KEYS = new Set(["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " ", "Escape", "Home", "End"]);

/** Keyboard use switches the reticle off; the next pointer move brings it back. */
export function useInputModality(store: FleetStore): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (KEYS.has(e.key) && store.getState().inputModality !== "keyboard") store.setState({ inputModality: "keyboard" });
    };
    const onPointer = () => {
      if (store.getState().inputModality !== "pointer") store.setState({ inputModality: "pointer" });
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointermove", onPointer);
    };
  }, [store]);
}

export function useReducedMotion(store: FleetStore): void {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => store.setState({ reducedMotion: mq.matches });
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [store]);
}
