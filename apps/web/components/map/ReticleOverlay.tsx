import type { ReticleRefs } from "@/hooks/useReticle";
import styles from "./ReticleOverlay.module.css";

/** Static markup for the precision reticle; the hook drives every style imperatively. */
export function ReticleOverlay({ refs }: { refs: ReticleRefs }) {
  const { root: rootRef, h: hRef, v: vRef, ret: retRef, lock: lockRef, read: readRef, read1: read1Ref, read2: read2Ref } = refs;
  return (
    <div ref={rootRef} className={styles.root} aria-hidden="true">
      <div ref={hRef} className={styles.hair} />
      <div ref={vRef} className={styles.hairV} />
      <div ref={retRef} className={styles.ret}>
        <span className={styles.cornerTL} />
        <span className={styles.cornerTR} />
        <span className={styles.cornerBL} />
        <span className={styles.cornerBR} />
        <span className={styles.dot} />
        <span className={styles.tickN} />
        <span className={styles.tickS} />
        <span ref={lockRef} className={styles.lock} />
      </div>
      <div ref={readRef} className={styles.read}>
        <span ref={read1Ref} className={styles.read1} />
        <span ref={read2Ref} className={styles.read2} />
      </div>
    </div>
  );
}
