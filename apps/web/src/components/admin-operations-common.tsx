"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminRequest } from "@/lib/operations";

export function useAdminResource<T>(path: string | null, pollMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const mutating = useRef(false);
  const requestVersion = useRef(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    const fetchData = async (background = false) => {
      if (mutating.current) return;
      const version = ++requestVersion.current;
      if (!background) { setBusy(true); setError(""); }
      try {
        const result = await adminRequest<T>(path);
        if (!cancelled && version === requestVersion.current) { setData(result); setLoadedPath(path); setError(""); }
      } catch (error) {
        if (!cancelled && version === requestVersion.current) setError(error instanceof Error ? error.message : "Не удалось загрузить данные.");
      } finally { if (!cancelled && !background) setBusy(false); }
    };
    void fetchData();
    const timer = pollMs ? setInterval(() => void fetchData(true), pollMs) : undefined;
    return () => { cancelled = true; clearInterval(timer); };
  }, [path, revision, pollMs]);
  async function run(action: () => Promise<unknown>) {
    mutating.current = true; requestVersion.current++;
    setBusy(true); setError("");
    try { await action(); reload(); }
    catch (error) { setError(error instanceof Error ? error.message : "Не удалось сохранить изменения."); }
    finally { mutating.current = false; setBusy(false); }
  }
  return { data: loadedPath === path ? data : null, error, busy, reload, run };
}

export function AdminNotice({ error, busy }: { error: string; busy: boolean }) {
  return <>{error ? <p role="alert" className="notice">{error}</p> : null}{busy ? <p role="status">Загружаем данные...</p> : null}</>;
}
export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`status-badge status-${status}`}>{label}</span>;
}
