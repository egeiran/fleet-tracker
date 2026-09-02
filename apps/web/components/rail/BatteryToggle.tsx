"use client";
import { useFleetSelector, useFleetStore } from "@/hooks/useFleetStore";
import { actions } from "@/lib/fleetStore";
import styles from "./BatteryToggle.module.css";

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={checked ? styles.trackOn : styles.track}
      onClick={onChange}
    >
      <span className={checked ? styles.knobOn : styles.knob} aria-hidden="true" />
    </button>
  );
}

export function BatteryToggle() {
  const store = useFleetStore();
  const on = useFleetSelector((s) => s.filters.lowBatt);
  const toggle = () => actions.toggleLowBatt(store);
  return (
    <div className={styles.row}>
      <span className={on ? styles.labelOn : styles.label} onClick={toggle}>
        Kun batteri under 50 %
      </span>
      <Switch checked={on} onChange={toggle} label="Kun batteri under 50 %" />
    </div>
  );
}
