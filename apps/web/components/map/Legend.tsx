"use client";
import { useFleetSelector } from "@/hooks/useFleetStore";
import { selectContentLeft } from "@/lib/selectors";
import { ShapeIcon } from "../shared/ShapeIcon";
import styles from "./Legend.module.css";

export function Legend() {
  const left = useFleetSelector(selectContentLeft);
  return (
    <div className={styles.legend} style={{ left }} aria-hidden="true">
      <span className={styles.key}>farge</span>
      <span className={styles.item}>
        <span className={styles.dot} style={{ background: "#CBF24D" }} />i bevegelse
      </span>
      <span className={styles.item}>
        <span className={styles.dot} style={{ background: "#7C847D" }} />i ro
      </span>
      <span className={styles.item}>
        <span className={styles.dot} style={{ background: "#FF7A52" }} />varsel
      </span>
      <span className={styles.sep} />
      <span className={styles.key}>form</span>
      <span className={styles.item}>
        <ShapeIcon mode="sjø" size={8} outline="#98A099" />sjø
      </span>
      <span className={styles.item}>
        <ShapeIcon mode="bane" size={8} outline="#98A099" />bane
      </span>
      <span className={styles.item}>
        <ShapeIcon mode="vei" size={7} outline="#98A099" />vei
      </span>
    </div>
  );
}
