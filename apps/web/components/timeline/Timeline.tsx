"use client";
import { formatClock, timeAt, tLabel } from "@vakt/domain";
import { useFleetSelector, useFleetStore } from "@/hooks/useFleetStore";
import { usePlayback } from "@/hooks/usePlayback";
import { selectContentLeft } from "@/lib/selectors";
import styles from "./Timeline.module.css";

const AXIS = ["−24 t", "−18", "−12", "−6", "nå"];

export function Timeline() {
  const store = useFleetStore();
  const { toggle, scrub } = usePlayback(store);
  const t = useFleetSelector((s) => s.t);
  const playing = useFleetSelector((s) => s.playing);
  const window = useFleetSelector((s) => s.window);
  const tz = useFleetSelector((s) => s.provider?.clockTimeZone ?? "UTC");
  const left = useFleetSelector(selectContentLeft);
  const coverageT = useFleetSelector((s) => {
    if (!s.provider || s.provider.kind !== "live" || !s.sel) return 0;
    const u = s.byId.get(s.sel);
    return u ? s.provider.coverageStartT(u) : 0;
  });

  const clock = formatClock(timeAt(window, t), tz);
  const rel = tLabel(t);
  const pct = `${t}%`;

  return (
    <div className={styles.dock} style={{ left }}>
      <div className={styles.panel} data-testid="timeline">
        <button
          type="button"
          className={styles.play}
          onClick={toggle}
          title="Spill av siste 24 timer"
          aria-label={playing ? "Pause avspilling" : "Spill av siste 24 timer"}
          aria-pressed={playing}
        >
          <span className={styles.playGlyph}>{playing ? "❚❚" : "▶"}</span>
        </button>
        <div className={styles.body}>
          <div className={styles.head}>
            <span className={styles.title}>
              <span>Avspilling · siste 24 t</span>
              <span className={styles.hint} style={{ opacity: playing ? 0.85 : 0 }} aria-hidden="true">
                grupper av
              </span>
            </span>
            <span className={styles.clockWrap}>
              <span className={styles.clock}>{clock}</span>
              <span className={styles.rel}>{rel}</span>
            </span>
          </div>
          <div className={styles.track}>
            <div className={styles.rail} />
            {coverageT > 0 && <div className={styles.noData} style={{ width: `${coverageT}%` }} title="Ingen sporhistorikk" />}
            <div className={styles.fill} style={{ width: pct }} />
            <div className={styles.ticks} aria-hidden="true">
              {AXIS.map((a) => (
                <span key={a} className={styles.tick} />
              ))}
            </div>
            <div className={styles.knob} style={{ left: pct }} />
            <input
              type="range"
              min={0}
              max={100}
              step={0.5}
              value={t}
              onChange={(e) => scrub(parseFloat(e.target.value))}
              className={styles.range}
              aria-label="Tidspunkt siste 24 timer"
              aria-valuetext={`${rel} · ${clock}`}
              data-testid="timeline-range"
            />
          </div>
          <div className={styles.axis} aria-hidden="true">
            {AXIS.map((a) => (
              <span key={a}>{a}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
