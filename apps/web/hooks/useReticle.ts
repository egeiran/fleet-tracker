"use client";
import { useEffect, useRef, type RefObject } from "react";
import { coordReadout, LOCK_RADIUS, shapeFor, type Unit } from "@vakt/domain";
import type { FleetStore } from "@/lib/fleetStore";
import { selectReticleEnabled } from "@/lib/selectors";
import type { MapController } from "./useFleetMap";

export interface ReticleRefs {
  root: RefObject<HTMLDivElement | null>;
  h: RefObject<HTMLDivElement | null>;
  v: RefObject<HTMLDivElement | null>;
  ret: RefObject<HTMLDivElement | null>;
  lock: RefObject<HTMLSpanElement | null>;
  read: RefObject<HTMLDivElement | null>;
  read1: RefObject<HTMLSpanElement | null>;
  read2: RefObject<HTMLSpanElement | null>;
  clu: RefObject<HTMLDivElement | null>;
  cluHead: RefObject<HTMLSpanElement | null>;
  cluList: RefObject<HTMLDivElement | null>;
}

export function useReticleRefs(): ReticleRefs {
  return {
    root: useRef<HTMLDivElement>(null),
    h: useRef<HTMLDivElement>(null),
    v: useRef<HTMLDivElement>(null),
    ret: useRef<HTMLDivElement>(null),
    lock: useRef<HTMLSpanElement>(null),
    read: useRef<HTMLDivElement>(null),
    read1: useRef<HTMLSpanElement>(null),
    read2: useRef<HTMLSpanElement>(null),
    clu: useRef<HTMLDivElement>(null),
    cluHead: useRef<HTMLSpanElement>(null),
    cluList: useRef<HTMLDivElement>(null),
  };
}

const TONE = { moving: "#CBF24D", idle: "#B9C1BA", alert: "#FF7A52" } as const;
const DOT_TONE = { moving: "#CBF24D", idle: "#8A928C", alert: "#FF7A52" } as const;

/**
 * The precision reticle: a custom cursor lerped per animation frame that locks magnetically on
 * the hovered unit or cluster. Deliberately outside React state — it runs 60 times a second.
 */
export function useReticle(
  surfaceRef: RefObject<HTMLDivElement | null>,
  mapRootRef: RefObject<HTMLDivElement | null>,
  ctrlRef: RefObject<MapController>,
  refs: ReticleRefs,
  store: FleetStore,
): void {
  useEffect(() => {
    const surface = surfaceRef.current;
    const mapRoot = mapRootRef.current;
    const ctrl = ctrlRef.current;
    if (!surface || !mapRoot || !ctrl) return;

    const cur = { x: -200, y: -200, tx: -200, ty: -200, s: 0.86, rot: 0, on: false, down: false, wasLocked: false };
    let raf = 0;
    let readT = 0;
    let cluKey: string | null = null;
    let enabled = false;
    let mode: "presisjon" | "minimal" | "av" = "presisjon";
    const ac = new AbortController();
    const { signal } = ac;

    const set = (e: PointerEvent) => {
      const r = surface.getBoundingClientRect();
      cur.tx = e.clientX - r.left;
      cur.ty = e.clientY - r.top;
      if (!cur.on) {
        cur.x = cur.tx;
        cur.y = cur.ty;
      }
      cur.on = true;
    };
    surface.addEventListener("pointermove", set, { signal, passive: true });
    surface.addEventListener("pointerenter", set, { signal });
    surface.addEventListener("pointerleave", () => (cur.on = false), { signal });
    surface.addEventListener("pointerdown", () => (cur.down = true), { signal });
    window.addEventListener("pointerup", () => (cur.down = false), { signal });
    window.addEventListener(
      "blur",
      () => {
        cur.on = false;
        cur.down = false;
      },
      { signal },
    );

    const hide = () => {
      const root = refs.root.current;
      if (root) root.style.opacity = "0";
      const clu = refs.clu.current;
      if (clu) clu.style.opacity = "0";
      mapRoot.dataset.reticle = "off";
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!enabled) return;
      const map = ctrl.map;
      const root = refs.root.current;
      const ret = refs.ret.current;
      if (!map || !root || !ret) return;
      const state = store.getState();

      let tx = cur.tx;
      let ty = cur.ty;
      let locked = false;
      let tone: string = TONE.moving;
      let cluHot: MapController["clusterPool"][number] | null = null;

      const hov = state.hover;
      if (hov && state.provider) {
        const u = state.byId.get(hov);
        if (u) {
          const p = map.project(state.provider.positionAt(u, state.t));
          if (Math.hypot(p.x - cur.tx, p.y - cur.ty) < LOCK_RADIUS.unit) {
            tx = p.x;
            ty = p.y;
            locked = true;
            tone = TONE[u.status];
          }
        }
      }
      if (!locked && ctrl.hoverCluster != null) {
        const slot = ctrl.clusterPool[ctrl.hoverCluster];
        if (slot?.pos) {
          const p = map.project(slot.pos);
          if (Math.hypot(p.x - cur.tx, p.y - cur.ty) < LOCK_RADIUS.cluster) {
            tx = p.x;
            ty = p.y;
            locked = true;
            cluHot = slot;
            tone = slot.alert ? TONE.alert : TONE.moving;
          }
        }
      }

      const k = locked ? 0.26 : 0.4;
      cur.x += (tx - cur.x) * k;
      cur.y += (ty - cur.y) * k;
      const ts = cur.down ? 0.68 : locked ? 1.26 : 0.86;
      const tr = locked ? 45 : 0;
      cur.s += (ts - cur.s) * 0.22;
      cur.rot += (tr - cur.rot) * 0.18;

      root.style.opacity = cur.on ? "1" : "0";
      root.style.color = tone;
      ret.style.transform = `translate3d(${cur.x - 23}px,${cur.y - 23}px,0) rotate(${cur.rot.toFixed(2)}deg) scale(${cur.s.toFixed(3)})`;

      const h = refs.h.current;
      const v = refs.v.current;
      const guides = mode === "presisjon" ? (cur.down ? 0.3 : locked ? 0.9 : 0.6) : 0;
      if (h) {
        h.style.transform = `translate3d(${(cur.x - 95).toFixed(1)}px,${cur.y.toFixed(1)}px,0)`;
        h.style.opacity = String(guides);
      }
      if (v) {
        v.style.transform = `translate3d(${cur.x.toFixed(1)}px,${(cur.y - 95).toFixed(1)}px,0)`;
        v.style.opacity = String(guides);
      }

      const lock = refs.lock.current;
      if (lock) {
        if (locked && !cur.wasLocked) {
          lock.style.animation = "none";
          void lock.offsetWidth;
          lock.style.animation = "lockSweep .5s cubic-bezier(.2,.8,.2,1) both";
        }
        if (!locked && cur.wasLocked) lock.style.animation = "none";
      }
      cur.wasLocked = locked;

      const w = surface.clientWidth;
      const hh = surface.clientHeight;
      const read = refs.read.current;
      if (read) {
        const flipX = cur.x > w - 170;
        const flipY = cur.y > hh - 60;
        read.style.transform = `translate3d(${cur.x + (flipX ? -160 : 26)}px,${cur.y + (flipY ? -46 : 16)}px,0)`;
        read.style.textAlign = flipX ? "right" : "left";
        read.style.alignItems = flipX ? "flex-end" : "flex-start";
        const show = (locked || cur.down) && cur.on && !cluHot;
        read.style.opacity = show ? "1" : "0";
        if ((locked || cur.down) && performance.now() - readT > 70) {
          readT = performance.now();
          const ll = map.unproject([cur.x, cur.y]);
          if (refs.read1.current) refs.read1.current.textContent = coordReadout(ll);
          if (refs.read2.current) refs.read2.current.textContent = `z ${map.getZoom().toFixed(2)} · ${ctrl.shownCount} i sikte`;
        }
      }

      const clu = refs.clu.current;
      if (clu) {
        const show = !!cluHot && cur.on && !cur.down;
        clu.style.opacity = show ? "1" : "0";
        if (show && cluHot) {
          const bw = clu.offsetWidth || 190;
          const bh = clu.offsetHeight || 120;
          const flipX = cur.x + 34 + bw > w - 20;
          const flipY = cur.y + 22 + bh > hh - 128;
          clu.style.transform = `translate3d(${cur.x + (flipX ? -bw - 30 : 34)}px,${cur.y + (flipY ? -bh - 18 : 22)}px,0)`;
          const key = cluHot.members.map((m) => m.id).join(",");
          if (key !== cluKey) {
            cluKey = key;
            renderClusterList(refs, cluHot.members.map((m) => state.byId.get(m.id)).filter((u): u is Unit => !!u));
          }
        } else if (cluKey) {
          cluKey = null;
        }
      }
    };

    const apply = () => {
      const s = store.getState();
      const next = selectReticleEnabled(s);
      mode = s.settings.reticle;
      if (next !== enabled) {
        enabled = next;
        if (enabled) {
          mapRoot.dataset.reticle = "on";
          cur.wasLocked = false;
        } else {
          hide();
        }
      }
    };
    apply();
    const unsub = store.subscribe(apply);

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) {
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVisibility, { signal });
    raf = requestAnimationFrame(loop);

    return () => {
      unsub();
      ac.abort();
      cancelAnimationFrame(raf);
      hide();
    };
  }, [surfaceRef, mapRootRef, ctrlRef, refs, store]);
}

function renderClusterList(refs: ReticleRefs, members: Unit[]): void {
  const head = refs.cluHead.current;
  const list = refs.cluList.current;
  if (head) head.textContent = `${members.length} enheter i gruppen`;
  if (!list) return;
  list.textContent = "";
  for (const u of members.slice(0, 6)) {
    const row = document.createElement("div");
    row.className = "clu-row";
    const sh = shapeFor(u.mode);
    const dot = document.createElement("span");
    dot.className = "clu-dot";
    dot.style.borderRadius = sh.radius;
    dot.style.transform = sh.rotate;
    dot.style.background = DOT_TONE[u.status];
    const id = document.createElement("span");
    id.className = "clu-id";
    id.textContent = u.id;
    const meta = document.createElement("span");
    meta.className = "clu-mode";
    meta.textContent = u.mode;
    row.append(dot, id, meta);
    list.appendChild(row);
  }
  if (members.length > 6) {
    const more = document.createElement("div");
    more.className = "clu-more";
    more.textContent = `+${members.length - 6} flere · klikk for å zoome`;
    list.appendChild(more);
  }
}
