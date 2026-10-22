"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { useI18n } from "@/i18n/provider";

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();
  const { t } = useI18n();
  useEffect(() => {
    const update = () => setVisible(window.scrollY > 600);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [pathname]);
  if (!visible || pathname.startsWith("/admin") || pathname === "/checkout") return null;
  return <button className={`mobile-scroll-top${pathname === "/cart" ? " mobile-scroll-top--cart" : ""}`} type="button" aria-label={t("Наверх")} title={t("Наверх")}
    onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}><ArrowUp size={22} aria-hidden="true" /></button>;
}
