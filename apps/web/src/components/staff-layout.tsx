"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import type { StaffUser } from "@dushanbe-fresh/shared";
import { canOpenStaffPage, logoutStaff, refreshStaff, roleLabels, staffEvent, staffHome } from "@/lib/staff-auth";

const StaffContext = createContext<StaffUser | null>(null);
export function useStaff() {
  const staff = useContext(StaffContext);
  if (!staff) throw new Error("Staff session is required");
  return staff;
}
export function StaffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const router = useRouter();
  const [user, setUser] = useState<StaffUser | null>(null);
  const [ready, setReady] = useState(false); const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => {
    const changed = (event: Event) => { setUser((event as CustomEvent<StaffUser | null>).detail); setReady(true); };
    window.addEventListener(staffEvent, changed);
    void refreshStaff().catch(() => undefined).finally(() => setReady(true));
    return () => window.removeEventListener(staffEvent, changed);
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (!user && pathname !== "/admin/login") router.replace("/admin/login");
    if (user && (pathname === "/admin/login" || !canOpenStaffPage(pathname, user))) router.replace(staffHome(user));
  }, [pathname, ready, router, user]);
  const loginPage = pathname === "/admin/login";
  if (!ready) return <main className="shell operations" role="status">Проверяем сессию...</main>;
  if (!user) return loginPage ? <>{children}</> : null;
  if (loginPage || !canOpenStaffPage(pathname, user)) return null;
  const links = user.role === "admin" ? [["/admin", "Каталог"], ["/admin/orders", "Заказы"], ["/admin/delivery-waves", "Волны доставки"], ["/admin/settings", "Настройки"]]
    : [["/admin/delivery-waves", user.role === "picker" ? "Мои волны" : "Доставка"]];
  return <StaffContext.Provider value={user}><div className="staff-app">
    <header className="staff-header"><div className="shell staff-header-inner">
      <Link className="staff-brand" href={staffHome(user)}>Dushanbe Fresh <span>Admin</span></Link>
      <div className="staff-account"><div><strong>{user.name ?? user.email}</strong><span>{roleLabels[user.role]}</span></div>
        <button className="secondary-link" disabled={loggingOut} onClick={async () => {
          setLoggingOut(true); setError("");
          try { await logoutStaff(); router.replace("/admin/login"); }
          catch { setError("Не удалось завершить сессию. Повторите выход."); }
          finally { setLoggingOut(false); }
        }}>Выйти</button></div>
    </div></header>
    <nav className="shell operations-nav staff-nav" aria-label="Разделы сотрудников">{links.map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`)) ? "page" : undefined}>{label}</Link>)}</nav>
    {error ? <p role="alert" className="shell notice">{error}</p> : null}{children}
  </div></StaffContext.Provider>;
}
