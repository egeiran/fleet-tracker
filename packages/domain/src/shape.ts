import type { Mode, Status } from "./types";

export interface Shape {
  size: number;
  radius: string;
  rotate: string;
}

/** Shape encodes transport mode: sea circle, rail square, road diamond. */
export function shapeFor(mode: Mode): Shape {
  if (mode === "bane") return { size: 10, radius: "2px", rotate: "none" };
  if (mode === "vei") return { size: 9, radius: "1px", rotate: "rotate(45deg)" };
  return { size: 11, radius: "50%", rotate: "none" };
}

export function statusLabel(s: Status): string {
  return s === "alert" ? "varsel" : s === "moving" ? "i bevegelse" : "i ro";
}

export const MODES: Mode[] = ["sjø", "bane", "vei"];
