"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRequest } from "@/lib/operations";

export function useAdminResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    setBusy(true); setError("");
    void adminRequest<T>(path).then(result => { if (!cancelled) setData(result); })
      .catch(error => { if (!cancelled) setError(error.message); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [path, revision]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await action(); reload(); }
    catch (error) { setError(error instanceof Error ? error.message : "Не удалось сохранить изменения."); }
    finally { setBusy(false); }
  }
  return { data, error, busy, reload, run };
}

export function AdminNotice({ error, busy }: { error: string; busy: boolean }) {
  return <>{error ? <p role="alert" className="notice">{error}</p> : null}{busy ? <p role="status">Загружаем данные...</p> : null}</>;
}
export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`status-badge status-${status}`}>{label}</span>;
}
