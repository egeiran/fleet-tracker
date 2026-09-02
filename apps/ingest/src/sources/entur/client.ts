import type { Bbox, EnturVehicle } from "@vakt/domain";
import { ENTUR_GRAPHQL_URL } from "../../config";

const QUERY = `query Vehicles($bbox: BoundingBox, $mode: VehicleModeEnumeration, $maxAge: Duration) {
  vehicles(mode: $mode, boundingBox: $bbox, maxDataAge: $maxAge) {
    vehicleId
    mode
    codespace { codespaceId }
    operator { operatorRef name }
    line { lineRef lineName publicCode }
    location { latitude longitude }
    lastUpdated
    lastUpdatedEpochSecond
    speed
    bearing
    delay
    originName
    destinationName
    serviceJourney { id }
  }
}`;

export class EnturClient {
  constructor(
    private clientName: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async railVehicles(bbox: Bbox): Promise<EnturVehicle[]> {
    const res = await this.fetchImpl(ENTUR_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "ET-Client-Name": this.clientName },
      body: JSON.stringify({
        query: QUERY,
        variables: {
          mode: "RAIL",
          maxAge: "PT10M",
          bbox: { minLat: bbox[0][1], minLon: bbox[0][0], maxLat: bbox[1][1], maxLon: bbox[1][0] },
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`entur ${res.status}`);
    const json = (await res.json()) as { data?: { vehicles?: EnturVehicle[] }; errors?: { message: string }[] };
    if (json.errors?.length) throw new Error(`entur: ${json.errors[0]!.message}`);
    return json.data?.vehicles ?? [];
  }
}
