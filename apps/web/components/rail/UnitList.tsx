"use client";
import { memo, useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import { statusLabel, unitTitle, type Unit } from "@vakt/domain";
import { useFleetSelector, useFleetStore } from "@/hooks/useFleetStore";
import { actions } from "@/lib/fleetStore";
import { selectEmpty, selectVisibleSorted } from "@/lib/selectors";
import { ShapeIcon } from "../shared/ShapeIcon";
import styles from "./UnitList.module.css";

const TONE = { moving: "#CBF24D", idle: "#8A928C", alert: "#FF7A52" } as const;

export function UnitList({ focusable }: { focusable: boolean }) {
  const store = useFleetStore();
  const items = useFleetSelector(selectVisibleSorted);
  const sel = useFleetSelector((s) => s.sel);
  const empty = useFleetSelector(selectEmpty);
  const listRef = useRef<HTMLDivElement>(null);

  // Roving tabindex: the selected row (or the first) is the single tab stop.
  const activeId = sel && items.some((u) => u.id === sel) ? sel : (items[0]?.id ?? null);

  const focusRow = useCallback((id: string) => {
    listRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!items.length) return;
    const current = (e.target as HTMLElement).dataset.id ?? activeId;
    const idx = Math.max(0, items.findIndex((u) => u.id === current));
    let next: number | null = null;
    if (e.key === "ArrowDown") next = Math.min(items.length - 1, idx + 1);
    else if (e.key === "ArrowUp") next = Math.max(0, idx - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (current) actions.select(store, current);
      return;
    }
    if (next !== null) {
      e.preventDefault();
      const id = items[next]!.id;
      actions.setHover(store, id);
      focusRow(id);
    }
  };

  useEffect(() => {
    if (sel) listRef.current?.querySelector(`[data-id="${CSS.escape(sel)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  return (
    <div
      ref={listRef}
      id="unit-list"
      className={styles.list}
      role="listbox"
      aria-label="Enheter"
      onKeyDown={onKeyDown}
      onMouseLeave={() => actions.setHover(store, null)}
    >
      {items.map((u) => (
        <UnitRow key={u.id} unit={u} selected={sel === u.id} tabStop={focusable && activeId === u.id} />
      ))}
      {empty && (
        <div className={styles.empty}>
          Ingen enheter matcher
          <br />
          disse filtrene
        </div>
      )}
    </div>
  );
}

const UnitRow = memo(function UnitRow({ unit, selected, tabStop }: { unit: Unit; selected: boolean; tabStop: boolean }) {
  const store = useFleetStore();
  const title = unitTitle(unit);
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={tabStop ? 0 : -1}
      data-id={unit.id}
      className={selected ? styles.rowSelected : styles.row}
      onClick={() => actions.select(store, unit.id)}
      onMouseEnter={() => actions.setHover(store, unit.id)}
      onFocus={() => actions.setHover(store, unit.id)}
    >
      <span className={styles.iconWrap}>
        <ShapeIcon mode={unit.mode} size={unit.mode === "sjø" ? 8 : unit.mode === "bane" ? 7 : 6} tone={TONE[unit.status]} />
      </span>
      <div className={styles.body}>
        <div className={styles.id}>
          {title}
          <span className="visually-hidden">
            {title !== unit.id && `, ${unit.id}`}, {statusLabel(unit.status)}
          </span>
        </div>
        <div className={styles.place}>{unit.place}</div>
      </div>
      <span className={styles.meta}>
        {unit.mode} · {unit.batt}%
      </span>
    </div>
  );
});
