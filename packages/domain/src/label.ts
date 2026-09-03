import type { Carrier, CarrierTrain, Unit } from "./types";

/** Entur vehicle ids embed the operating day ("834-2026-09-02"); the part before it is the operator's own train number. */
export function trainNumber(vehicleId: string): string {
  return vehicleId.replace(/-\d{4}-\d{2}-\d{2}$/, "");
}

/** Public line code ("RE11"), falling back to the tail of the line ref, then the line name. */
export function trainLine(c: CarrierTrain): string | undefined {
  return c.publicCode ?? c.lineRef?.split(":").pop() ?? c.lineName;
}

/** What the carrier is called by its own operator: "MS MARION ANITA", "Vy RE11 · tog 834". Null for mock carriers. */
export function carrierTitle(c: Carrier): string | null {
  if (c.kind === "vessel") return `MS ${c.name}`;
  if (c.kind === "train") {
    const line = trainLine(c);
    return `${c.operatorLabel}${line ? ` ${line}` : ""} · tog ${trainNumber(c.vehicleId)}`;
  }
  return null;
}

/** Display name for a unit: the real carrier's own name when it rides one, otherwise the unit id. */
export function unitTitle(u: Unit): string {
  return carrierTitle(u.carrier) ?? u.id;
}

/** Which source the identity comes from and the identifiers to look it up with. Null for mock carriers. */
export function carrierProvenance(c: Carrier): string | null {
  if (c.kind === "vessel") {
    const parts = ["Kystverket AIS", `MMSI ${c.mmsi}`];
    if (c.imo) parts.push(`IMO ${c.imo}`);
    if (c.callSign) parts.push(`kallesignal ${c.callSign}`);
    return parts.join(" · ");
  }
  if (c.kind === "train") {
    const parts = [
      "Entur sanntid",
      `${c.operatorLabel} (${c.codespace})`,
      `kjøretøy ${c.vehicleId}`,
    ];
    if (c.lineRef) parts.push(`linje ${c.lineRef}`);
    return parts.join(" · ");
  }
  return null;
}
