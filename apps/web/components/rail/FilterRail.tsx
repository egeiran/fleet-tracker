"use client";
import { MODES, statusLabel, type StatusFilter } from "@vakt/domain";
import { useFleetSelector, useFleetStore } from "@/hooks/useFleetStore";
import { actions } from "@/lib/fleetStore";
import { selectCounts, selectShownCount } from "@/lib/selectors";
import { ShapeIcon } from "../shared/ShapeIcon";
import { BatteryToggle } from "./BatteryToggle";
import { UnitList } from "./UnitList";
import styles from "./FilterRail.module.css";

const STATUS_CHIPS: { k: StatusFilter; label: string }[] = [
  { k: "all", label: "alle" },
  { k: "moving", label: "bevegelse" },
  { k: "idle", label: "i ro" },
  { k: "alert", label: "varsel" },
];

export function FilterRail() {
  const store = useFleetStore();
  const rail = useFleetSelector((s) => s.rail);
  const q = useFleetSelector((s) => s.filters.q);
  const status = useFleetSelector((s) => s.filters.status);
  const modes = useFleetSelector((s) => s.filters.modes);
  const counts = useFleetSelector(selectCounts);
  const shown = useFleetSelector(selectShownCount);

  return (
    <aside className={styles.rail} data-open={rail ? "1" : "0"} aria-label="Filtre og enheter" aria-hidden={!rail}>
      <div className={styles.searchRow}>
        <div className={styles.searchWrap}>
          <label htmlFor="unit-search" className="visually-hidden">
            Søk enhet, sted, booking
          </label>
          <input
            id="unit-search"
            type="search"
            value={q}
            onChange={(e) => actions.setSearch(store, e.target.value)}
            placeholder="Søk enhet, sted, booking"
            className={styles.search}
            autoComplete="off"
            aria-controls="unit-list"
            tabIndex={rail ? 0 : -1}
          />
          <span className={styles.lens} aria-hidden="true" />
          <span className={styles.lensStem} aria-hidden="true" />
        </div>
        <button
          type="button"
          onClick={() => actions.toggleRail(store)}
          title="Skjul panelet"
          aria-label="Skjul filterpanelet"
          className={styles.hide}
          tabIndex={rail ? 0 : -1}
        >
          ‹
        </button>
      </div>

      <div className={styles.filters}>
        <div className={styles.group}>
          <span className={styles.groupLabel} id="status-label">
            Status
          </span>
          <div className={styles.tray2} role="group" aria-labelledby="status-label">
            {STATUS_CHIPS.map((c) => {
              const on = status === c.k;
              const cls = on ? (c.k === "alert" ? styles.chipAlert : styles.chipOn) : styles.chip;
              const n = c.k === "all" ? counts.all : counts[c.k];
              return (
                <button
                  key={c.k}
                  type="button"
                  className={cls}
                  aria-pressed={on}
                  onClick={() => actions.setStatus(store, c.k)}
                  tabIndex={rail ? 0 : -1}
                >
                  <span>{c.label}</span>
                  <span className={styles.chipCount}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.group}>
          <span className={styles.groupLabel} id="mode-label">
            Transportform
          </span>
          <div className={styles.tray3} role="group" aria-labelledby="mode-label">
            {MODES.map((m) => {
              const on = modes.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  className={on ? styles.chipOn : styles.chip}
                  aria-pressed={on}
                  onClick={() => actions.toggleMode(store, m)}
                  tabIndex={rail ? 0 : -1}
                >
                  <ShapeIcon mode={m} size={m === "sjø" ? 9 : m === "bane" ? 8 : 7} outline="currentColor" />
                  <span>{m}</span>
                </button>
              );
            })}
          </div>
        </div>

        <BatteryToggle />
      </div>

      <div className={styles.result}>
        <span className={styles.resultLabel} aria-live="polite">
          {shown} av {counts.all} enheter
        </span>
        <button type="button" className={styles.reset} onClick={() => actions.reset(store)} tabIndex={rail ? 0 : -1}>
          Nullstill
        </button>
      </div>

      <UnitList focusable={rail} />
    </aside>
  );
}

export function RailPill() {
  const store = useFleetStore();
  const rail = useFleetSelector((s) => s.rail);
  const shown = useFleetSelector(selectShownCount);
  if (rail) return null;
  return (
    <button type="button" className={styles.pill} onClick={() => actions.toggleRail(store)} aria-label={`Vis filtre, ${shown} enheter vises`}>
      <span>Filtre</span>
      <span className={styles.pillCount}>{shown}</span>
    </button>
  );
}

export { statusLabel };
