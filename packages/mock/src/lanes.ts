import type { Mode } from "@vakt/domain";

export type Lane = [from: string, to: string, mode: Mode];

/** The prototype's 24 lanes between the 18 hubs. Order is part of the seeded fleet. */
export const LANES: Lane[] = [
  ["oslo", "rotterdam", "sjø"],
  ["oslo", "hamburg", "sjø"],
  ["goteborg", "rotterdam", "sjø"],
  ["kiel", "goteborg", "sjø"],
  ["hirtshals", "kristiansand", "sjø"],
  ["bergen", "bremerhaven", "sjø"],
  ["stavanger", "hamburg", "sjø"],
  ["alesund", "bergen", "sjø"],
  ["antwerpen", "oslo", "sjø"],
  ["goteborg", "malmo", "bane"],
  ["kobenhavn", "malmo", "bane"],
  ["hamburg", "aarhus", "bane"],
  ["oslo", "goteborg", "bane"],
  ["helsingborg", "malmo", "bane"],
  ["hamburg", "bremerhaven", "bane"],
  ["oslo", "fredrikstad", "vei"],
  ["stavanger", "kristiansand", "vei"],
  ["hamburg", "kiel", "vei"],
  ["rotterdam", "antwerpen", "vei"],
  ["aarhus", "hirtshals", "vei"],
  ["trondheim", "alesund", "vei"],
  ["oslo", "trondheim", "vei"],
  ["kobenhavn", "aarhus", "vei"],
  ["bergen", "stavanger", "vei"],
];

export const SEA_LANES = LANES.filter((l) => l[2] === "sjø");
export const RAIL_LANES = LANES.filter((l) => l[2] === "bane");
export const ROAD_LANES = LANES.filter((l) => l[2] === "vei");
