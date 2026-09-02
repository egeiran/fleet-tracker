import { useSyncExternalStore } from "react";

export type Listener = () => void;

export interface Store<T> {
  getState: () => T;
  setState: (patch: Partial<T> | ((s: T) => Partial<T>)) => void;
  subscribe: (cb: Listener) => () => void;
}

/** Minimal external store: React reads via useSyncExternalStore, imperative code via getState(). */
export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const subs = new Set<Listener>();
  return {
    getState: () => state,
    setState: (patch) => {
      const p = typeof patch === "function" ? patch(state) : patch;
      let changed = false;
      for (const k in p) {
        if ((state as Record<string, unknown>)[k] !== (p as Record<string, unknown>)[k]) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...p };
      for (const cb of subs) cb();
    },
    subscribe: (cb) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
  };
}

export function useStoreSelector<T extends object, R>(store: Store<T>, selector: (s: T) => R): R {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}
