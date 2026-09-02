const LABELS: Record<number, string> = {
  0: "underveis med motor",
  1: "til ankers",
  2: "ikke under kommando",
  3: "begrenset manøvreringsevne",
  4: "begrenset av dypgang",
  5: "fortøyd",
  6: "på grunn",
  7: "fisker",
  8: "underveis for seil",
  11: "slept",
  12: "sleper",
  14: "AIS-SART",
  15: "ikke angitt",
};

export function navStatusLabel(code: number | null | undefined): string | undefined {
  if (code == null) return undefined;
  return LABELS[code];
}

/** Statuses that mean the vessel is not moving under its own power. */
export function isStationaryNavStatus(code: number | null | undefined): boolean {
  return code === 1 || code === 5 || code === 6;
}
