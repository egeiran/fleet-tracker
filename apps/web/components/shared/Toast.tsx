"use client";
import { useEffect } from "react";
import { useFleetSelector, useFleetStore } from "@/hooks/useFleetStore";
import styles from "./Toast.module.css";

export function Toast() {
  const store = useFleetStore();
  const toast = useFleetSelector((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => store.setState({ toast: null }), 4000);
    return () => clearTimeout(t);
  }, [toast, store]);
  if (!toast) return null;
  return (
    <div className={styles.toast} role="status">
      {toast}
    </div>
  );
}
