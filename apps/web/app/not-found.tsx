import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--c-text-dim)",
      }}
    >
      <div style={{ textAlign: "center", lineHeight: 2 }}>
        Fant ikke siden
        <br />
        <Link href="/">Til kartet</Link>
      </div>
    </div>
  );
}
