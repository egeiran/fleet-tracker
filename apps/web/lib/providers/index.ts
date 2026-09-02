import type { Settings } from "@vakt/domain";
import { createLiveProvider } from "./liveProvider";
import { createMockProvider } from "./mockProvider";
import type { FleetProvider } from "./types";

export const INGEST_URL = process.env.NEXT_PUBLIC_INGEST_URL ?? "http://localhost:8080";

export function createProvider(settings: Settings): FleetProvider {
  return settings.source === "live" ? createLiveProvider(INGEST_URL) : createMockProvider(settings.fleetSize);
}

export type { FleetProvider, FleetSnapshotView, ProviderStatus } from "./types";
