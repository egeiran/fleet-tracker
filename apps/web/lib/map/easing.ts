/** Map camera curve from the handoff. */
export const cubicOut = (t: number): number => 1 - Math.pow(1 - t, 3);
