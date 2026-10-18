"use client";
import { useI18n } from "@/i18n/provider";


import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { lastOrderEvent, lastTracking, trackingPath } from "@/lib/tracking";
import { isActiveOrder, orderActivity, orderActivityEvent, rememberOrderActivity } from "@/lib/active-order";
import type { PublicOrderDto } from "@dushanbe-fresh/shared";

export function LastOrderLink({ activeOnly = false }: { activeOnly?: boolean }) {
  const { t } = useI18n();
  const [tracking, setTracking] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    const read = () => setTracking(lastTracking());
    read(); window.addEventListener("storage", read); window.addEventListener(lastOrderEvent, read);
    return () => { window.removeEventListener("storage", read); window.removeEventListener(lastOrderEvent, read); };
  }, []);
  useEffect(() => {
    if (!activeOnly || !tracking) { setActive(false); return; }
    let stopped = false;
    let controller: AbortController | undefined;
    const read = () => setActive(orderActivity(tracking)?.active ?? false);
    const load = async () => {
      read();
      // Tracking already polls and publishes activity; do not duplicate its requests.
      if (pathname === trackingPath(tracking) || Date.now() - (orderActivity(tracking)?.checkedAt ?? 0) < 60000) return;
      controller?.abort(); const requestController = new AbortController(); controller = requestController;
      const timeout = setTimeout(() => requestController.abort(), 5000);
      try {
        const response = await fetch(`/api/v1/public/orders/${tracking}`, { cache: "no-store", credentials: "same-origin", referrerPolicy: "no-referrer", signal: requestController.signal });
        if (!stopped && response.ok) rememberOrderActivity(tracking, isActiveOrder(await response.json() as PublicOrderDto));
        else if (!stopped && response.status === 404) rememberOrderActivity(tracking, false);
      } catch { /* The saved link remains available in the footer if verification fails. */ }
      finally { clearTimeout(timeout); }
    };
    void load();
    window.addEventListener(orderActivityEvent, read); window.addEventListener("focus", load);
    return () => { stopped = true; controller?.abort(); window.removeEventListener(orderActivityEvent, read); window.removeEventListener("focus", load); };
  }, [activeOnly, tracking, pathname]);
  if (activeOnly && (!tracking || !active)) return null;
  return tracking ? <Link className={activeOnly ? "header-last-order" : undefined} href={trackingPath(tracking)} title={t("Мой заказ")}>
    {activeOnly ? <PackageCheck size={19} aria-hidden="true" /> : null}<span>{t("Мой заказ")}</span></Link> :
    <span className="site-nav__inactive" aria-disabled="true" title={t("Нет сохранённого заказа")}>{t("Мой заказ")}</span>;
}
