/**
 * Shared contract between the ingest worker, the web app and the mock generator.
 * Everything on the wire is plain JSON; timestamps are epoch milliseconds.
 */

export type Mode = "sjø" | "bane" | "vei";
export type Status = "moving" | "idle" | "alert";
export type StatusFilter = "all" | Status;
export type EventTone = "alert" | "warn" | "ok" | "muted";
export type SourceKind = "live" | "buffered" | "mock";

export type LngLat = [lng: number, lat: number];
/** [lon, lat, epoch ms] — tracks are sorted by ascending timestamp. */
export type TrackPoint = [lng: number, lat: number, ts: number];

export interface UnitEvent {
  ts: number;
  /** Preformatted "HH:MM" (Europe/Oslo) or a relative label such as "dag 2"; live clients reformat from `ts`. */
  time: string;
  label: string;
  place: string;
  tone: EventTone;
  coord?: LngLat;
  /** True for simulated sensor events; false for facts derived from real data. */
  simulated: boolean;
}

export interface CarrierVessel {
  kind: "vessel";
  mmsi: number;
  name: string;
  imo?: number;
  callSign?: string;
  shipType: number;
  shipTypeLabel: string;
  lengthM?: number;
  destinationRaw?: string;
  destination?: string;
  eta?: string;
  navStatus?: number;
  navStatusLabel?: string;
  sog?: number;
  cog?: number;
  heading?: number;
  lastSeen: number;
}

export interface CarrierTrain {
  kind: "train";
  vehicleId: string;
  codespace: string;
  operatorLabel: string;
  lineRef?: string;
  publicCode?: string;
  lineName?: string;
  origin?: string;
  destination?: string;
  speed?: number;
  bearing?: number;
  delaySec?: number;
  serviceJourneyId?: string;
  lastSeen: number;
}

export interface CarrierMock {
  kind: "mock";
  lane: [from: string, to: string];
  label: string;
}

export type Carrier = CarrierVessel | CarrierTrain | CarrierMock;

export interface Unit {
  id: string;
  slot: number;
  status: Status;
  mode: Mode;
  source: SourceKind;
  stale: boolean;
  position: LngLat;
  positionTs: number;
  heading?: number;
  place: string;
  batt: number;
  temp: number;
  door: "lukket" | "åpen";
  booking: string;
  cargoLabel: string;
  sensors: "simulert";
  /** Newest first. */
  events: UnitEvent[];
  carrier: Carrier;
  track: TrackPoint[];
  trackCoverageFrom: number | null;
  trackCoverageTo: number | null;
  /** Mock-only: the prototype's synthetic route and progress fraction. */
  path?: LngLat[];
  progress?: number;
}

export type SourceStateKind = "starting" | "ok" | "degraded" | "unavailable" | "mock";

export interface SourceState {
  state: SourceStateKind;
  detail?: string;
  lastMessageAt?: number;
  carriers: number;
  assigned: number;
}

export interface Coverage {
  sea: SourceState;
  rail: SourceState;
  road: SourceState;
}

export interface TimeWindow {
  from: number;
  to: number;
}

export interface Snapshot {
  generatedAt: number;
  version: number;
  source: "live" | "partial" | "mock";
  window: TimeWindow;
  units: Unit[];
  coverage: Coverage;
  attribution: string[];
}

export interface Health {
  ok: true;
  uptimeSec: number;
  version: string;
  coverage: Coverage;
  db: { positions: number };
  sse: { clients: number };
  entur: { ok: boolean; vehicles: number; lastSuccessAt?: number };
  stream: { connected: boolean; reconnects: number; linesPerMin: number; since?: string };
}

export type IngestEvent =
  | { type: "hello"; version: number; generatedAt: number }
  | {
      type: "position";
      id: string;
      point: TrackPoint;
      heading?: number;
      sog?: number;
      status: Status;
      stale: boolean;
      place: string;
    }
  | { type: "status"; id: string; status: Status; stale: boolean; place: string }
  | { type: "unit"; unit: Unit }
  | { type: "coverage"; coverage: Coverage }
  | { type: "resync" }
  | { type: "heartbeat"; at: number };

export interface FilterState {
  status: StatusFilter;
  modes: Mode[];
  lowBatt: boolean;
  q: string;
}

export type ReticleMode = "presisjon" | "minimal" | "av";
export type TrailMode = "fra zoom" | "valgt" | "alle" | "av";

export interface Settings {
  source: "mock" | "live";
  reticle: ReticleMode;
  wake: boolean;
  clustering: boolean;
  clusterPx: number;
  trails: TrailMode;
  fleetSize: number;
}
