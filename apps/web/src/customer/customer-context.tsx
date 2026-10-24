"use client";
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { CustomerAuthStatus, CustomerProfile } from "@dushanbe-fresh/shared";
import { customerRequest } from "@/lib/customer";
import { CustomerLogin } from "@/components/customer-login";
import { CHECKOUT_DRAFT_KEY } from "@/lib/checkout-draft";

type Context = {
  user: CustomerProfile | null; status: CustomerAuthStatus; loading: boolean;
  login: () => void; logout: () => Promise<void>; refresh: () => Promise<void>;
  loginAndThen: (action: () => void) => void;
};
const CustomerContext = createContext<Context | null>(null);
export function CustomerProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CustomerProfile | null>(null);
  const [status, setStatus] = useState<CustomerAuthStatus>({ enabled: false, requiredForCheckout: false });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const afterLogin = useRef<(() => void) | null>(null);
  const requestVersion = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const next = await customerRequest<CustomerAuthStatus>("customer-auth/status");
      const nextUser = next.enabled ? await customerRequest<CustomerProfile | null>("customer-auth/me") : null;
      if (version !== requestVersion.current) return;
      setStatus(next);
      setUser(nextUser);
    } catch { if (version === requestVersion.current) { setUser(null); setStatus({ enabled: false, requiredForCheckout: false }); } }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, []);
  useEffect(() => { const version = requestVersion; void refresh(); return () => { version.current++; }; }, [refresh]);
  useEffect(() => {
    const update = () => { void refresh(); };
    window.addEventListener("focus", update);
    return () => window.removeEventListener("focus", update);
  }, [refresh]);
  return <CustomerContext.Provider value={{ user, status, loading, login: () => { afterLogin.current = null; setOpen(true); },
    loginAndThen: action => { afterLogin.current = action; setOpen(true); }, refresh,
    logout: async () => {
      await customerRequest("customer-auth/logout", "POST");
      requestVersion.current++;
      try { for (const key of [CHECKOUT_DRAFT_KEY, `${CHECKOUT_DRAFT_KEY}.user.${user?.id}`, "df.delivery.address.v1", "df.delivery.address.account.v1"]) sessionStorage.removeItem(key); } catch { /* Server logout still succeeds with blocked storage. */ }
      setUser(null);
    } }}>
    {children}
    {open ? <CustomerLogin available={status.enabled} onClose={() => { setOpen(false); afterLogin.current = null; void refresh(); }} onSuccess={value => {
      requestVersion.current++;
      setUser(value); setOpen(false); const action = afterLogin.current; afterLogin.current = null; action?.();
    }} /> : null}
  </CustomerContext.Provider>;
}
export function useCustomer() {
  const context = useContext(CustomerContext);
  if (!context) throw new Error("CustomerProvider missing");
  return context;
}

export function useOptionalCustomer() { return useContext(CustomerContext); }
