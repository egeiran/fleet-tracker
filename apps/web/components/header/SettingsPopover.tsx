"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { SETTINGS_LIMITS, type ReticleMode, type Settings, type TrailMode } from "@vakt/domain";
import { useFleetSelector, useFleetStore } from "@/hooks/useFleetStore";
import { actions } from "@/lib/fleetStore";
import { Switch } from "../rail/BatteryToggle";
import styles from "./SettingsPopover.module.css";

const RETICLES: ReticleMode[] = ["presisjon", "minimal", "av"];
const TRAILS: TrailMode[] = ["fra zoom", "valgt", "alle", "av"];

export function SettingsButton() {
  const store = useFleetStore();
  const open = useFleetSelector((s) => s.settingsOpen);
  const btnRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={open ? styles.gearActive : styles.gear}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        aria-label="Innstillinger"
        title="Innstillinger"
        onClick={() => store.setState({ settingsOpen: !open })}
      >
        <span className={styles.gearRing} aria-hidden="true" />
        <span className={styles.gearTick} data-dir="n" aria-hidden="true" />
        <span className={styles.gearTick} data-dir="s" aria-hidden="true" />
        <span className={styles.gearTick} data-dir="e" aria-hidden="true" />
        <span className={styles.gearTick} data-dir="w" aria-hidden="true" />
      </button>
      {open && <SettingsPopover id={id} onClose={() => btnRef.current?.focus()} />}
    </>
  );
}

function SettingsPopover({ id, onClose }: { id: string; onClose: () => void }) {
  const store = useFleetStore();
  const settings = useFleetSelector((s) => s.settings);
  const reducedMotion = useFleetSelector((s) => s.reducedMotion);
  const modality = useFleetSelector((s) => s.inputModality);
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const close = () => {
    store.setState({ settingsOpen: false });
    onClose();
  };
  const set = (patch: Partial<Settings>) => actions.setSettings(store, patch);

  useEffect(() => {
    const el = ref.current;
    el?.querySelector<HTMLElement>("button, input")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      } else if (e.key === "Tab" && el) {
        const focusables = [...el.querySelectorAll<HTMLElement>("button, input")].filter((f) => !f.hasAttribute("disabled"));
        if (!focusables.length) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const onDown = (e: PointerEvent) => {
      if (el && !el.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("[aria-controls]")) close();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reticleHint = reducedMotion ? "av (redusert bevegelse)" : modality === "keyboard" ? "av (tastatur)" : null;

  return (
    <div ref={ref} id={id} className={styles.popover} role="dialog" aria-modal="false" aria-labelledby={titleId}>
      <div className={styles.head}>
        <span id={titleId} className={styles.title}>
          Innstillinger
        </span>
        <button type="button" className={styles.close} onClick={close} aria-label="Lukk innstillinger">
          ✕
        </button>
      </div>

      <Section label="Datakilde">
        <Chips
          options={[
            ["mock", "mockdata"],
            ["live", "live"],
          ]}
          value={settings.source}
          onChange={(v) => set({ source: v as Settings["source"] })}
        />
      </Section>

      <Section label="Musepeker" hint={reticleHint}>
        <Chips options={RETICLES.map((r) => [r, r])} value={settings.reticle} onChange={(v) => set({ reticle: v as ReticleMode })} />
      </Section>

      <Section label="Bevegelse">
        <ToggleRow label="Hale bak enheter" checked={settings.wake} onChange={() => set({ wake: !settings.wake })} />
      </Section>

      <Section label="Gruppering">
        <ToggleRow label="Grupper tette enheter" checked={settings.clustering} onChange={() => set({ clustering: !settings.clustering })} />
        <RangeRow
          label="Cellestørrelse"
          value={settings.clusterPx}
          unit="px"
          limits={SETTINGS_LIMITS.clusterPx}
          onChange={(v) => set({ clusterPx: v })}
          disabled={!settings.clustering}
        />
      </Section>

      <Section label="Kart">
        <Chips options={TRAILS.map((t) => [t, t])} value={settings.trails} onChange={(v) => set({ trails: v as TrailMode })} columns={4} />
      </Section>

      {settings.source === "mock" && (
        <Section label="Flåte">
          <RangeRow
            label="Antall enheter"
            value={settings.fleetSize}
            limits={SETTINGS_LIMITS.fleetSize}
            onChange={(v) => set({ fleetSize: v })}
          />
        </Section>
      )}
    </div>
  );
}

function Section({ label, hint, children }: { label: string; hint?: string | null; children: ReactNode }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionLabel}>{label}</span>
        {hint && <span className={styles.sectionHint}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Chips({
  options,
  value,
  onChange,
  columns,
}: {
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
  columns?: number;
}) {
  return (
    <div className={styles.tray} role="group" style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, 1fr)` }}>
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          className={v === value ? styles.chipOn : styles.chip}
          aria-pressed={v === value}
          onClick={() => onChange(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <div className={styles.row}>
      <span className={checked ? styles.rowLabelOn : styles.rowLabel}>{label}</span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

function RangeRow({
  label,
  value,
  unit,
  limits,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  unit?: string;
  limits: { min: number; max: number; step: number };
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={styles.rangeRow} data-disabled={disabled ? "1" : undefined}>
      <label htmlFor={id} className={styles.rowLabel}>
        {label}
      </label>
      <input
        id={id}
        type="range"
        className={styles.range}
        min={limits.min}
        max={limits.max}
        step={limits.step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className={styles.rangeValue}>
        {value}
        {unit ?? ""}
      </span>
    </div>
  );
}
