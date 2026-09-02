import { shapeFor, type Mode } from "@vakt/domain";
import type { CSSProperties } from "react";

interface Props {
  mode: Mode;
  size: number;
  /** Fill colour; omit for an outline icon. */
  tone?: string;
  outline?: string;
  outlineWidth?: number;
  className?: string;
}

/** Sea = circle, rail = square, road = diamond. Pure CSS, no icon library (by design). */
export function ShapeIcon({ mode, size, tone, outline, outlineWidth = 1.5, className }: Props) {
  const sh = shapeFor(mode);
  const style: CSSProperties = {
    display: "inline-block",
    flex: "0 0 auto",
    width: size,
    height: size,
    borderRadius: sh.radius,
    transform: sh.rotate,
    background: tone ?? "transparent",
    border: outline ? `${outlineWidth}px solid ${outline}` : undefined,
  };
  return <span aria-hidden="true" className={className} style={style} />;
}
