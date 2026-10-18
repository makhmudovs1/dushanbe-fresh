"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { FAVORITES_KEY, parseFavorites, toggleFavorite } from "./favorites";

const Context = createContext<{ ids: string[]; ready: boolean; toggle: (id: string) => void }>({ ids: [], ready: false, toggle: () => {} });

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const read = () => { try { setIds(parseFavorites(localStorage.getItem(FAVORITES_KEY))); } catch { setIds([]); } };
    const storage = (event: StorageEvent) => { if (event.key === FAVORITES_KEY || event.key === null) read(); };
    read(); setReady(true); window.addEventListener("storage", storage);
    return () => window.removeEventListener("storage", storage);
  }, []);
  useEffect(() => {
    if (ready) try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids)); } catch { /* In-memory favorites still work if storage is blocked. */ }
  }, [ids, ready]);
  const value = useMemo(() => ({ ids, ready, toggle: (id: string) => setIds(current => toggleFavorite(current, id)) }), [ids, ready]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useFavorites() { return useContext(Context); }
