"use client";
import { useI18n } from "@/i18n/provider";


import Link from "next/link";
import { usePathname } from "next/navigation";
import { LastOrderLink } from "./last-order-link";

export function SiteFooter() {
  const { t, locale } = useI18n();
  const pathname = usePathname();
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;
  return <footer className="site-footer"><div className="shell site-footer__inner">
    <div><Link className="site-footer__brand" href="/">Dushanbe Fresh</Link>
      <p>{t("Свежие продукты с рынков Душанбе с доставкой домой.")}</p>
    </div>
    <nav aria-label={t("Навигация в подвале")}>
      <Link href="/catalog">{t("Каталог")}</Link><Link href="/about">{t("О сервисе")}</Link><LastOrderLink />
      <Link href="/photo-credits">{locale === "tg" ? "Манбаъҳои аксҳо" : "Источники фотографий"}</Link>
    </nav>
    <small>© 2026 Dushanbe Fresh</small>
  </div></footer>;
}
