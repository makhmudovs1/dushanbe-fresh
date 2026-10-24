"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Heart } from "lucide-react";
import { FAVORITES_KEY, parseFavorites } from "./favorites";
import { useOptionalCustomer } from "@/customer/customer-context";
import { CustomerError, customerRequest } from "@/lib/customer";
import { useI18n } from "@/i18n/provider";
import { CustomerDialog } from "@/components/customer-dialog";

const Context = createContext<{ ids: string[]; ready: boolean; busyIds?: Set<string>; toggle: (id: string) => void }>({ ids: [], ready: false, toggle: () => {} });
const emptyIds: string[] = [];

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const customer = useOptionalCustomer();
  const { t } = useI18n();
  const owner = customer?.loading ? "loading" : customer?.user?.id ?? "guest";
  const ownerRef = useRef(owner); ownerRef.current = owner;
  const refreshCustomer = customer?.refresh;
  const revision = useRef(0);
  const busy = useRef(new Set<string>());
  const [state, setState] = useState({ owner: "loading", ids: [] as string[], ready: false });
  const [busyIds, setBusyIds] = useState(new Set<string>());
  const [prompt, setPrompt] = useState<string | null>(null);
  const [queued, setQueued] = useState<string | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    if (owner === "loading" || busy.current.size) return;
    const requestRevision = ++revision.current;
    try {
      const ids = owner === "guest" ? parseFavorites(localStorage.getItem(FAVORITES_KEY))
        : (await customerRequest<{ ids: string[] }>("customer/favorites")).ids;
      if (ownerRef.current === owner && revision.current === requestRevision) { setState({ owner, ids, ready: true }); setError(""); }
    } catch (error) {
      if (ownerRef.current !== owner || revision.current !== requestRevision) return;
      setState(current => ({ owner, ids: current.owner === owner ? current.ids : [], ready: owner === "guest" }));
      if (owner !== "guest") setError("Не удалось загрузить избранное. Повторите попытку.");
      if (error instanceof CustomerError && error.status === 401) void refreshCustomer?.();
    }
  }, [owner, refreshCustomer]);
  useEffect(() => { busy.current.clear(); setBusyIds(new Set()); setError(""); void reload(); }, [reload]);
  useEffect(() => {
    const focus = () => { void reload(); };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [reload]);
  const change = useCallback(async (id: string, active: boolean) => {
    if (owner === "guest" || owner === "loading" || busy.current.has(id)) return;
    revision.current++;
    busy.current.add(id); setBusyIds(new Set(busy.current)); setError("");
    setState(current => current.owner === owner ? { ...current, ids: active ? [...new Set([...current.ids, id])] : current.ids.filter(value => value !== id) } : current);
    try { await customerRequest(`customer/favorites/${encodeURIComponent(id)}`, "PUT", { active }); }
    catch (error) {
      if (ownerRef.current === owner) {
        setState(current => ({ ...current, ids: active ? current.ids.filter(value => value !== id) : [...new Set([...current.ids, id])] }));
        setError("Не удалось сохранить избранное. Повторите попытку.");
        if (error instanceof CustomerError && error.status === 401) void refreshCustomer?.();
      }
    } finally {
      if (ownerRef.current === owner) { busy.current.delete(id); setBusyIds(new Set(busy.current)); }
    }
  }, [owner, refreshCustomer]);
  const ready = state.owner === owner && state.ready;
  useEffect(() => { if (queued && ready && owner !== "guest") { setQueued(null); void change(queued, true); } }, [queued, ready, owner, change]);
  const ids = state.owner === owner ? state.ids : emptyIds;
  const value = useMemo(() => ({ ids, ready, busyIds, toggle: (id: string) => {
    if (owner === "guest") setPrompt(id);
    else if (ready) void change(id, !ids.includes(id));
  } }), [ids, ready, busyIds, owner, change]);
  return <Context.Provider value={value}>
    {children}
    {error ? <div className="account-sync-notice" role="status"><span>{t(error)}</span><button type="button" onClick={() => void reload()}>{t("Повторить")}</button></div> : null}
    {prompt ? <CustomerDialog title={t("Всё сохраним, только войдите в аккаунт")} onClose={() => setPrompt(null)} className="favorite-login-prompt">
      <div className="customer-prompt-icon customer-prompt-icon--heart"><Heart size={32} fill="currentColor" aria-hidden="true" /></div>
      <p>{t("Войдите, чтобы сохранять понравившиеся товары")}</p>
      <div className="customer-prompt-actions"><button type="button" className="secondary-link" onClick={() => setPrompt(null)}>{t("В другой раз")}</button>
        <button type="button" className="primary-action" onClick={() => {
          const id = prompt; setPrompt(null); customer?.loginAndThen(() => setQueued(id));
        }}>{t("Войти")}</button></div>
    </CustomerDialog> : null}
  </Context.Provider>;
}

export function useFavorites() { return useContext(Context); }
