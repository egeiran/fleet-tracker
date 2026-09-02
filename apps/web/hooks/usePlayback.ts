"use client";
import { useCallback, useEffect, useRef } from "react";
import type { FleetStore } from "@/lib/fleetStore";

/** t += 0.5 every 40 ms from 0 to 100; scrubbing pauses. */
export function usePlayback(store: FleetStore) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const pause = useCallback(() => {
    stop();
    store.setState({ playing: false });
  }, [stop, store]);

  const play = useCallback(() => {
    stop();
    store.setState((s) => ({ playing: true, t: s.t >= 99.5 ? 0 : s.t }));
    timer.current = setInterval(() => {
      const nt = store.getState().t + 0.5;
      if (nt >= 100) {
        stop();
        store.setState({ t: 100, playing: false });
      } else {
        store.setState({ t: nt });
      }
    }, 40);
  }, [stop, store]);

  const toggle = useCallback(() => {
    if (store.getState().playing) pause();
    else play();
  }, [pause, play, store]);

  const scrub = useCallback(
    (t: number) => {
      stop();
      store.setState({ t, playing: false });
    },
    [stop, store],
  );

  useEffect(() => stop, [stop]);
  return { play, pause, toggle, scrub };
}
