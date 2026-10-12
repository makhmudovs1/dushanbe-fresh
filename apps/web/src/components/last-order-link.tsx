"use client";
import { useI18n } from "@/i18n/provider";


import Link from "next/link";
import { useEffect, useState } from "react";
import { lastOrderEvent, lastTracking, trackingPath } from "@/lib/tracking";

export function LastOrderLink() {
  const { t } = useI18n();
  const [tracking, setTracking] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setTracking(lastTracking());
    read(); window.addEventListener("storage", read); window.addEventListener(lastOrderEvent, read);
    return () => { window.removeEventListener("storage", read); window.removeEventListener(lastOrderEvent, read); };
  }, []);
  return tracking ? <Link href={trackingPath(tracking)}>{t("Мой заказ")}</Link> :
    <span className="site-nav__inactive" aria-disabled="true" title={t("Нет сохранённого заказа")}>{t("Мой заказ")}</span>;
}
