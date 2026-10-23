"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Dock = { element: HTMLElement; navigate: (href: string) => void };
const DockContext = createContext<Dock | null>(null);
const RegisterContext = createContext<(element: HTMLElement | null, navigate: (href: string) => void) => void>(() => {});

export function MobileNavigationDockProvider({ children }: { children: ReactNode }) {
  const [dock, setDock] = useState<Dock | null>(null);
  const register = useCallback((element: HTMLElement | null, navigate: (href: string) => void) => {
    setDock(previous => previous?.element === element && previous?.navigate === navigate ? previous : element ? { element, navigate } : null);
  }, []);
  return <RegisterContext.Provider value={register}><DockContext.Provider value={dock}>{children}</DockContext.Provider></RegisterContext.Provider>;
}

export function useMobileNavigationDock() { return useContext(DockContext); }

export function MobileNavigationSlot({ onNavigate }: { onNavigate: (href: string) => void }) {
  const register = useContext(RegisterContext);
  const mount = useCallback((element: HTMLDivElement | null) => register(element, onNavigate), [register, onNavigate]);
  return <div className="mobile-navigation-slot" ref={mount} />;
}
