import type { ReactNode } from "react";

export function VisuallyHidden({ children, as: Tag = "span" }: { children: ReactNode; as?: "span" | "div" | "label" }) {
  return <Tag className="visually-hidden">{children}</Tag>;
}
