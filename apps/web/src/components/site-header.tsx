"use client";
import { LanguageSwitcher, useI18n } from "@/i18n/provider";


import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Heart, MapPin, Menu, ShoppingCart } from "lucide-react";
import { BrandLogo } from "./brand-logo";
import { LastOrderLink } from "./last-order-link";
import { CatalogDialog } from "./catalog-dialog";
import { CategorySidebar } from "./category-navigation";
import { CategorySkeleton } from "./loading-state";
import { Category, getCategories } from "@/lib/api";
import { CatalogSearch } from "./catalog-search";

import { useCart } from "@/cart/cart-context";

export function DeliveryLocation({ mobile = false, address }: { mobile?: boolean; address?: string }) {
  const { t } = useI18n();
  return <span className={`header-location header-location--${mobile ? "mobile" : "desktop"}`}>
    <MapPin size={mobile ? 12 : 17} aria-hidden="true" />{address || t("Душанбе")}</span>;
}

export function SiteHeader() {
  const { t } = useI18n();
  const { lineCount, hydrated } = useCart();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loading, setLoading] = useState(false);
  async function openCatalog() {
    setDrawer(true); setLoading(true);
    try { setCategories(await getCategories()); } catch { setCategories(null); }
    finally { setLoading(false); }
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;

  return (
    <header className={`site-header${pathname === "/" || pathname === "/catalog" || pathname === "/favorites" ? " site-header--with-sidebar" : ""}`}>
      <div className="header-brand">
      <BrandLogo />
      <DeliveryLocation mobile />
      </div>
      <button className="header-catalog-trigger" type="button" aria-label={t("Открыть каталог")} title={t("Открыть каталог")}
        aria-expanded={drawer} onClick={() => void openCatalog()}><Menu size={21} aria-hidden="true" /></button>
      <CatalogSearch />
      <DeliveryLocation />
      <nav className="site-nav" aria-label={t("Основная навигация")}>
        <LastOrderLink activeOnly />
        <Link className="header-favorites" href="/favorites" aria-label={t("Избранное")} title={t("Избранное")}><Heart size={22} aria-hidden="true" /></Link>
        <Link className="cart-link" href="/cart" aria-label={t(hydrated ? `Корзина, позиций: ${lineCount}` : "Корзина")}>
          <ShoppingCart size={22} aria-hidden="true" />
          <span>{t("Корзина")}</span>
          <strong aria-hidden={!hydrated}>{hydrated ? lineCount : ""}</strong>
        </Link>
      </nav>
      <LanguageSwitcher />
      {drawer ? <CatalogDialog title={t("Каталог")} busy={false} className="category-drawer" closeLabel={t("Закрыть каталог")}
        onClose={() => setDrawer(false)}>
        {loading ? <CategorySkeleton /> : <CategorySidebar categories={categories} onNavigate={() => setDrawer(false)} onRetry={() => void openCatalog()} />}
        <Link className="category-drawer__cart" href="/cart" onClick={() => setDrawer(false)}><ShoppingCart size={20} aria-hidden="true" />
          <span>{t("Корзина")}</span><strong>{hydrated ? lineCount : ""}</strong></Link>
      </CatalogDialog> : null}
    </header>
  );
}
