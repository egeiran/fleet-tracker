"use client";
import { useEffect, useRef, useState } from "react";
import { formatDegrees, formatDelay, formatKnots, statusLabel, type Unit, type UnitEvent } from "@vakt/domain";
import { useFleetSelector, useFleetStore } from "@/hooks/useFleetStore";
import { actions } from "@/lib/fleetStore";
import { selectSelectedUnit } from "@/lib/selectors";
import styles from "./DetailPanel.module.css";

const TONE = { moving: "#CBF24D", idle: "#8A928C", alert: "#FF7A52" } as const;
const TAG_BG = { moving: "rgba(203,242,77,0.13)", idle: "#101413", alert: "rgba(255,122,82,0.14)" } as const;
const EVENT_TONE = { alert: "#FF7A52", warn: "#F2C14E", ok: "#CBF24D", muted: "#7C847D" } as const;

export function DetailPanel() {
  const unit = useFleetSelector(selectSelectedUnit);
  if (!unit) return null;
  return <Panel key={unit.id} unit={unit} />;
}

function Panel({ unit }: { unit: Unit }) {
  const store = useFleetStore();
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = `detail-${unit.id}`;
  const metrics = [
    { k: "Temperatur", v: `${unit.temp} °C` },
    { k: "Batteri", v: `${unit.batt} %` },
    { k: "Dør", v: unit.door === "åpen" ? "ÅPEN" : "lukket" },
    { k: "Last", v: unit.cargoLabel || "tørrlast" },
  ];
  return (
    <section className={styles.panel} role="complementary" aria-labelledby={titleId} data-testid="detail-panel">
      <div className={styles.top}>
        <div className={styles.topRow}>
          <div>
            <div className={styles.id} id={titleId}>
              {unit.id}
            </div>
            <div className={styles.place}>{unit.place}</div>
          </div>
          <button ref={closeRef} type="button" className={styles.close} onClick={() => actions.select(store, null)} aria-label="Lukk detaljpanel">
            ✕
          </button>
        </div>
        <div className={styles.tags}>
          <span className={styles.tag} style={{ background: TAG_BG[unit.status], color: TONE[unit.status] }}>
            {statusLabel(unit.status)}
          </span>
          <span className={styles.tagMuted}>{unit.mode}</span>
          <span className={styles.tagMuted}>{unit.booking}</span>
          {unit.stale && <span className={styles.tagWarn}>siste kontakt</span>}
        </div>
        <CarrierLine unit={unit} />
      </div>

      <div className={styles.metrics}>
        {metrics.map((m) => (
          <div key={m.k} className={styles.metric}>
            <div className={styles.metricKey}>{m.k}</div>
            <div className={styles.metricValue}>{m.v}</div>
          </div>
        ))}
        {unit.source !== "mock" && <div className={styles.simNote}>simulert sensor</div>}
      </div>

      <div className={styles.log}>
        <div className={styles.logHead}>Hendelseslogg</div>
        {unit.events.map((e, i) => (
          <Event key={`${e.ts}-${i}`} e={e} />
        ))}
      </div>

      <div className={styles.foot}>
        <ShareButton id={unit.id} />
      </div>
    </section>
  );
}

function CarrierLine({ unit }: { unit: Unit }) {
  const c = unit.carrier;
  if (c.kind === "vessel") {
    return (
      <div className={styles.carrier}>
        <span className={styles.carrierKey}>om bord</span>
        <span className={styles.carrierValue}>
          {c.name} · MMSI {c.mmsi} · {c.shipTypeLabel}
          {unit.status !== "idle" && ` · kurs ${formatDegrees(c.cog ?? c.heading)} · ${formatKnots(c.sog)}`}
          {c.destination && ` · → ${c.destination}`}
        </span>
      </div>
    );
  }
  if (c.kind === "train") {
    const line = c.publicCode ?? c.lineName ?? c.vehicleId;
    return (
      <div className={styles.carrier}>
        <span className={styles.carrierKey}>om bord</span>
        <span className={styles.carrierValue}>
          tog {line}
          {c.origin && c.destination && ` · ${c.origin} → ${c.destination}`} · {c.operatorLabel}
          {c.delaySec != null && ` · ${formatDelay(c.delaySec)}`}
        </span>
      </div>
    );
  }
  return null;
}

function Event({ e }: { e: UnitEvent }) {
  return (
    <div className={styles.event}>
      <span className={styles.eventDot} style={{ background: EVENT_TONE[e.tone] }} aria-hidden="true" />
      <div className={styles.eventRow}>
        <span className={styles.eventTime}>{e.time}</span>
        <span className={styles.eventLabel}>{e.label}</span>
      </div>
      <div className={styles.eventPlace}>
        {e.place}
        {e.simulated && <span className={styles.eventSim}> · simulert</span>}
      </div>
    </div>
  );
}

function ShareButton({ id }: { id: string }) {
  const store = useFleetStore();
  const copied = useFleetSelector((s) => s.copied);
  const [announce, setAnnounce] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const copy = async () => {
    const url = `${window.location.origin}/spor/${encodeURIComponent(id)}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* clipboard unavailable; the URL is still visible in the address bar of /spor */
      }
      ta.remove();
    }
    store.setState({ copied: true });
    setAnnounce("Lenke kopiert");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      store.setState({ copied: false });
      setAnnounce("");
    }, 2000);
  };
  return (
    <>
      <button type="button" className={copied ? styles.shareCopied : styles.share} onClick={copy}>
        {copied ? "Lenke kopiert ✓" : "Del sporingslenke"}
      </button>
      <span className="visually-hidden" aria-live="polite">
        {announce}
      </span>
    </>
  );
}
