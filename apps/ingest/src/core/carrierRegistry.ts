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

  constructor(private maxEntries = 5000) {}

  get size(): number {
    return this.map.size;
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
    this.map.delete(key);
    this.map.set(key, obs);
    if (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    return obs;
  }

  vessels(): Observed[] {
    return [...this.map.values()].filter((o) => o.carrier.kind === "vessel");
  }

  trains(): Observed[] {
    return [...this.map.values()].filter((o) => o.carrier.kind === "train");
  }

  evictUnseenSince(before: number, keep: Set<string>): number {
    let n = 0;
    for (const [k, o] of this.map) {
      if (o.lastSeen < before && !keep.has(k)) {
        this.map.delete(k);
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
