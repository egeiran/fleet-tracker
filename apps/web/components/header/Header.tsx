"use client";
import { useFleetSelector } from "@/hooks/useFleetStore";
import { selectCounts } from "@/lib/selectors";
import { DataSourceBadge } from "./DataSourceBadge";
import { SettingsButton } from "./SettingsPopover";
import styles from "./Header.module.css";

const DISABLED_NAV = ["Bookinger", "Varsler", "Analyse"];

export function Header() {
  const counts = useFleetSelector(selectCounts);
  const conn = useFleetSelector((s) => s.conn);
  const dotClass = conn === "stale" ? styles.dotWarn : conn === "offline" || conn === "unavailable" ? styles.dotAlert : styles.dot;
  return (
    <header className={styles.header} role="banner">
      <div className={styles.lockup}>
        <span className={styles.mark} aria-hidden="true" />
        <span className={styles.wordmark}>Vakt</span>
        <span className={styles.sub}>flåteintelligens</span>
      </div>
      <nav className={styles.nav} aria-label="Hovednavigasjon">
        <a className={styles.navActive} href="/" aria-current="page">
          Kart
        </a>
        {DISABLED_NAV.map((label) => (
          <span key={label} className={styles.navDisabled} title="Ikke i denne prototypen" aria-disabled="true">
            {label}
          </span>
        ))}
      </nav>
      <div className={styles.spacer} />
      <div className={styles.meta}>
        <div className={styles.stat}>
          <span className={dotClass} aria-hidden="true" />
          <span className={styles.statValue}>{counts.all}</span> enheter
        </div>
        <div className={styles.stat}>
          <span className={styles.alertValue}>{counts.alert}</span> varsler
        </div>
        <DataSourceBadge />
        <SettingsButton />
      </div>
    </header>
  );
}
