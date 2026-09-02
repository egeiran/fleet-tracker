export type ShipClass =
  | "passasjer"
  | "last"
  | "tank"
  | "fiske"
  | "hjelpefartøy"
  | "fritid"
  | "annet"
  | "ukjent";

export interface ShipTypeInfo {
  code: number;
  class: ShipClass;
  label: string;
}

const SPECIAL: Record<number, string> = {
  30: "fiskefartøy",
  31: "slepebåt",
  32: "slepebåt",
  33: "mudringsfartøy",
  34: "dykkerfartøy",
  35: "militært fartøy",
  36: "seilbåt",
  37: "fritidsbåt",
  50: "losbåt",
  51: "redningsfartøy",
  52: "taubåt",
  53: "havnefartøy",
  54: "forurensningsvern",
  55: "politi/toll",
  58: "sanitetsfartøy",
  59: "annet hjelpefartøy",
};

/** ITU-R M.1371 ship type codes. Kept in one place so the UI never sees magic numbers. */
export function shipTypeInfo(code: number | null | undefined): ShipTypeInfo {
  if (code == null || !Number.isFinite(code) || code <= 0) {
    return { code: 0, class: "ukjent", label: "ukjent fartøy" };
  }
  const c = Math.floor(code);
  const decade = Math.floor(c / 10) * 10;
  if (decade === 60) return { code: c, class: "passasjer", label: "passasjer/ro-ro" };
  if (decade === 70) return { code: c, class: "last", label: "lasteskip" };
  if (decade === 80) return { code: c, class: "tank", label: "tankskip" };
  if (c === 30) return { code: c, class: "fiske", label: SPECIAL[30]! };
  if (c === 36 || c === 37) return { code: c, class: "fritid", label: SPECIAL[c]! };
  if (decade === 50 || (c >= 31 && c <= 35)) {
    return { code: c, class: "hjelpefartøy", label: SPECIAL[c] ?? "hjelpefartøy" };
  }
  if (decade === 40) return { code: c, class: "passasjer", label: "hurtigbåt" };
  if (decade === 90) return { code: c, class: "annet", label: "annet fartøy" };
  if (decade === 20) return { code: c, class: "annet", label: "WIG-fartøy" };
  return { code: c, class: "annet", label: "annet fartøy" };
}

export function isCargoClass(code: number | null | undefined): boolean {
  return shipTypeInfo(code).class === "last";
}
