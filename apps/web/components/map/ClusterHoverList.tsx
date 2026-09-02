import type { ReticleRefs } from "@/hooks/useReticle";
import styles from "./ClusterHoverList.module.css";

/** Discreet member list shown when the reticle locks on a cluster. Content is filled imperatively. */
export function ClusterHoverList({ refs }: { refs: ReticleRefs }) {
  const { clu: cluRef, cluHead: cluHeadRef, cluList: cluListRef } = refs;
  return (
    <div ref={cluRef} className={styles.panel} aria-hidden="true">
      <span ref={cluHeadRef} className={styles.head} />
      <div ref={cluListRef} className={styles.list} />
    </div>
  );
}
