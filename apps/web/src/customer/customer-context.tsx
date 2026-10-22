"use client";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import type { CustomerAuthStatus, CustomerProfile } from "@dushanbe-fresh/shared";
import { customerRequest } from "@/lib/customer";
import { CustomerLogin } from "@/components/customer-login";

type Context = {
  user: CustomerProfile | null; status: CustomerAuthStatus; loading: boolean;
  login: () => void; logout: () => Promise<void>; refresh: () => Promise<void>;
};
const CustomerContext = createContext<Context | null>(null);
export function CustomerProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CustomerProfile | null>(null);
  const [status, setStatus] = useState<CustomerAuthStatus>({ enabled: false, requiredForCheckout: false });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const next = await customerRequest<CustomerAuthStatus>("customer-auth/status");
      setStatus(next);
      setUser(next.enabled ? await customerRequest<CustomerProfile | null>("customer-auth/me") : null);
    } catch { setUser(null); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const update = () => { void refresh(); };
    window.addEventListener("focus", update);
    return () => window.removeEventListener("focus", update);
  }, [refresh]);
  return <CustomerContext.Provider value={{ user, status, loading, login: () => setOpen(true), refresh,
    logout: async () => { await customerRequest("customer-auth/logout", "POST"); setUser(null); } }}>
    {children}
    {open ? <CustomerLogin onClose={() => setOpen(false)} onSuccess={value => { setUser(value); setOpen(false); }} /> : null}
  </CustomerContext.Provider>;
}
export function useCustomer() {
  const context = useContext(CustomerContext);
  if (!context) throw new Error("CustomerProvider missing");
  return context;
}
