import {
  aisToCarrier,
  aisToPoint,
  enturToCarrier,
  enturToPoint,
  trainCarrierKey,
  vesselCarrierKey,
  type AisMessage,
  type Carrier,
  type CarrierTrain,
  type CarrierVessel,
  type EnturVehicle,
  type TrackPoint,
} from "@vakt/domain";

export interface Observed {
  key: string;
  carrier: Carrier;
  point: TrackPoint;
  prevPoint: TrackPoint | null;
  lastSeen: number;
}

/** In-memory pool of every carrier seen recently. Only assigned carriers are persisted. */
export class CarrierRegistry {
  private map = new Map<string, Observed>();
  private pinned = new Set<string>();
  private counts = { vessel: 0, train: 0 };

  constructor(private maxEntries = 5000) {}

  /** Assigned carriers are pinned: LRU eviction and the unseen sweep skip them. */
  setPinned(keys: Iterable<string>): void {
    this.pinned = new Set(keys);
  }

  count(kind: "vessel" | "train"): number {
    return this.counts[kind];
  }

  get(key: string): Observed | undefined {
    return this.map.get(key);
  }

  observeVessel(m: AisMessage): Observed | null {
    const point = aisToPoint(m);
    if (!point) return null;
    const key = vesselCarrierKey(m.mmsi);
    const prev = this.map.get(key);
    if (prev && point[2] < prev.point[2]) return null;
    const carrier = aisToCarrier(m, prev?.carrier.kind === "vessel" ? (prev.carrier as CarrierVessel) : undefined);
    return this.put(key, carrier, point, prev);
  }

  observeTrain(v: EnturVehicle): Observed | null {
    const point = enturToPoint(v);
    if (!point) return null;
    const carrier = enturToCarrier(v);
    const key = trainCarrierKey(carrier);
    const prev = this.map.get(key);
    if (prev && point[2] <= prev.point[2]) {
      prev.carrier = carrier;
      return prev;
    }
    return this.put(key, carrier, point, prev);
  }

  /** Re-register a carrier restored from the database (no fresh position yet). */
  restore(key: string, carrier: Carrier, point: TrackPoint): Observed {
    return this.put(key, carrier, point, this.map.get(key));
  }

  private put(key: string, carrier: Carrier, point: TrackPoint, prev: Observed | undefined): Observed {
    const obs: Observed = { key, carrier, point, prevPoint: prev?.point ?? null, lastSeen: point[2] };
    if (this.map.delete(key)) this.bump(prev?.carrier, -1);
    this.map.set(key, obs);
    this.bump(carrier, 1);
    if (this.map.size > this.maxEntries) {
      for (const oldest of this.map.keys()) {
        if (this.pinned.has(oldest)) continue;
        this.remove(oldest);
        break;
      }
    }
    return obs;
  }

  private remove(key: string): void {
    const o = this.map.get(key);
    if (!o) return;
    this.map.delete(key);
    this.bump(o.carrier, -1);
  }

  private bump(carrier: Carrier | undefined, d: number): void {
    if (carrier?.kind === "vessel") this.counts.vessel += d;
    else if (carrier?.kind === "train") this.counts.train += d;
  }

  vessels(): Observed[] {
    return [...this.map.values()].filter((o) => o.carrier.kind === "vessel");
  }

  trains(): Observed[] {
    return [...this.map.values()].filter((o) => o.carrier.kind === "train");
  }

  evictUnseenSince(before: number): number {
    let n = 0;
    for (const [k, o] of this.map) {
      if (o.lastSeen < before && !this.pinned.has(k)) {
        this.remove(k);
        n++;
      }
    }
    return n;
  }
}

export function isVessel(o: Observed): o is Observed & { carrier: CarrierVessel } {
  return o.carrier.kind === "vessel";
}
export function isTrain(o: Observed): o is Observed & { carrier: CarrierTrain } {
  return o.carrier.kind === "train";
}
