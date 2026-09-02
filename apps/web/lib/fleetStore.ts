import {
  DEFAULT_SETTINGS,
  EMPTY_FILTERS,
  type Coverage,
  type FilterState,
  type Mode,
  type Settings,
  type StatusFilter,
  type TimeWindow,
  type Unit,
} from "@vakt/domain";
import { MOCK_WINDOW } from "@vakt/mock";
import { createStore, type Store } from "./store";
import type { FleetProvider } from "./providers/types";

export type ConnStatus = "mock" | "connecting" | "live" | "stale" | "offline" | "unavailable";
export type InputModality = "pointer" | "keyboard";

export interface FleetState {
  fleet: Unit[];
  byId: ReadonlyMap<string, Unit>;
  window: TimeWindow;
  provider: FleetProvider | null;
  conn: ConnStatus;
  lastUpdate: number | null;
  coverage: Coverage | null;
  attribution: string[];

  filters: FilterState;
  sel: string | null;
  pendingSel: string | null;
  hover: string | null;

  t: number;
  playing: boolean;

  labels: boolean;
  rail: boolean;
  copied: boolean;
  settingsOpen: boolean;
  toast: string | null;

  inputModality: InputModality;
  reducedMotion: boolean;
  settings: Settings;
  settingsReady: boolean;
  mapReady: boolean;
}

export type FleetStore = Store<FleetState>;

export function createFleetStore(initial: Partial<FleetState> = {}): FleetStore {
  return createStore<FleetState>({
    fleet: [],
    byId: new Map(),
    window: MOCK_WINDOW,
    provider: null,
    conn: "mock",
    lastUpdate: null,
    coverage: null,
    attribution: [],
    filters: EMPTY_FILTERS,
    sel: null,
    pendingSel: null,
    hover: null,
    t: 100,
    playing: false,
    labels: false,
    rail: true,
    copied: false,
    settingsOpen: false,
    toast: null,
    inputModality: "pointer",
    reducedMotion: false,
    settings: DEFAULT_SETTINGS,
    settingsReady: false,
    mapReady: false,
    ...initial,
  });
}

/* ---- actions ---- */

export const actions = {
  setFleet(store: FleetStore, fleet: Unit[], window: TimeWindow) {
    const byId = new Map<string, Unit>();
    for (const u of fleet) byId.set(u.id, u);
    store.setState({ fleet, byId, window });
  },
  setStatus(store: FleetStore, status: StatusFilter) {
    store.setState((s) => ({ filters: { ...s.filters, status }, sel: null }));
  },
  toggleMode(store: FleetStore, m: Mode) {
    store.setState((s) => ({
      filters: {
        ...s.filters,
        modes: s.filters.modes.includes(m) ? s.filters.modes.filter((x) => x !== m) : [...s.filters.modes, m],
      },
      sel: null,
    }));
  },
  toggleLowBatt(store: FleetStore) {
    store.setState((s) => ({ filters: { ...s.filters, lowBatt: !s.filters.lowBatt }, sel: null }));
  },
  setSearch(store: FleetStore, q: string) {
    store.setState((s) => ({ filters: { ...s.filters, q }, sel: null }));
  },
  reset(store: FleetStore) {
    store.setState({ filters: EMPTY_FILTERS, sel: null });
  },
  select(store: FleetStore, id: string | null) {
    store.setState({ sel: id, copied: false });
  },
  setHover(store: FleetStore, id: string | null) {
    store.setState({ hover: id });
  },
  setT(store: FleetStore, t: number) {
    store.setState({ t: Math.max(0, Math.min(100, t)) });
  },
  toggleRail(store: FleetStore) {
    store.setState((s) => ({ rail: !s.rail }));
  },
  setSettings(store: FleetStore, patch: Partial<Settings>) {
    store.setState((s) => ({ settings: { ...s.settings, ...patch } }));
  },
  toast(store: FleetStore, message: string) {
    store.setState({ toast: message });
  },
};
