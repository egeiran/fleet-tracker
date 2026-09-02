"use client";
import { formatClockSeconds } from "@vakt/domain";
import { useFleetSelector } from "@/hooks/useFleetStore";
import styles from "./DataSourceBadge.module.css";

const LABEL = {
  mock: "mockdata",
  connecting: "kobler til",
  live: "live",
  stale: "live · forsinket",
  offline: "frakoblet",
  unavailable: "live utilgjengelig",
} as const;

export function DataSourceBadge() {
  const conn = useFleetSelector((s) => s.conn);
  const lastUpdate = useFleetSelector((s) => s.lastUpdate);
  const coverage = useFleetSelector((s) => s.coverage);
  const seaOff = conn === "live" && coverage && coverage.sea.state !== "ok" && coverage.sea.state !== "starting";
  const text = seaOff ? "live · sjø utilgj." : LABEL[conn];
  const title = lastUpdate ? `Sist oppdatert ${formatClockSeconds(lastUpdate)}` : undefined;
  const cls = conn === "mock" ? styles.badge : conn === "live" ? styles.badgeLive : styles.badgeWarn;
  return (
    <span className={cls} role="status" title={title} data-testid="source-badge">
      {text}
    </span>
  );
}
