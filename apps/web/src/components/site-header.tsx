"use client";
import { LanguageSwitcher, useI18n } from "@/i18n/provider";


import Link from "next/link";
import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, ShoppingCart, UserRound } from "lucide-react";
import { DeliveryAddressTrigger } from "@/customer/delivery-address-context";
import { useCustomer } from "@/customer/customer-context";
import { BrandLogo } from "./brand-logo";
import { LastOrderLink } from "./last-order-link";
import { CatalogDialog } from "./catalog-dialog";
import { CategorySidebar } from "./category-navigation";
import { CategorySkeleton } from "./loading-state";
import { Category, getCategories } from "@/lib/api";
import { CatalogSearch } from "./catalog-search";

import { useCart } from "@/cart/cart-context";

export function DeliveryLocation({ mobile = false }: { mobile?: boolean }) {
  return <DeliveryAddressTrigger eyebrow={mobile ? undefined : "Доставка в"} className={`header-location header-location--${mobile ? "mobile" : "desktop"}`} />;
}

export function SiteHeader() {
  const { t } = useI18n();
  const { lineCount, hydrated } = useCart();
  const customer = useCustomer();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const update = () => setCompact(window.scrollY > 140);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  async function openCatalog() {
    setDrawer(true); setLoading(true);
    try { setCategories(await getCategories()); } catch { setCategories(null); }
    finally { setLoading(false); }
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;

  return (
    <header className={`site-header${pathname === "/" || pathname === "/catalog" || pathname === "/favorites" ? " site-header--with-sidebar" : ""}${compact ? " site-header--compact" : ""}${pathname === "/cart" ? " site-header--cart" : ""}`}>
      <div className="header-brand">
      <BrandLogo />
      <DeliveryLocation mobile />
      </div>
      <button className="header-catalog-trigger" type="button" aria-label={t("Открыть каталог")} title={t("Открыть каталог")}
        aria-expanded={drawer} onClick={() => void openCatalog()}><Menu size={21} aria-hidden="true" /></button>
      <CatalogSearch />
      <Link href="/" className="header-scroll-brand" aria-label="Dushanbe Fresh"><Image src="/brand/mark-v3.webp" width={32} height={32} alt="" /></Link>
      <DeliveryLocation />
      <LanguageSwitcher />
      <nav className="site-nav" aria-label={t("Основная навигация")}>
        <Link className="cart-link" href="/cart" aria-current={pathname === "/cart" ? "page" : undefined} aria-label={t(hydrated ? `Корзина, позиций: ${lineCount}` : "Корзина")}>
          <ShoppingCart size={22} aria-hidden="true" />
          <span>{t("Корзина")}</span>
          <strong aria-hidden={!hydrated}>{hydrated ? lineCount : ""}</strong>
        </Link>
        {customer.user ? <Link href="/account" className="header-account" title={t("Профиль")} aria-label={t("Профиль")}><UserRound size={21} aria-hidden="true" /></Link>
          : <button className="header-account" type="button" onClick={customer.login} title={t("Войти")} aria-label={t("Войти")}><UserRound size={21} aria-hidden="true" /></button>}
        <LastOrderLink activeOnly />
      </nav>
      {drawer ? <CatalogDialog title={t("Каталог")} busy={false} className="category-drawer" closeLabel={t("Закрыть каталог")}
        onClose={() => setDrawer(false)}>
        {loading ? <CategorySkeleton /> : <CategorySidebar categories={categories} onNavigate={() => setDrawer(false)} onRetry={() => void openCatalog()} />}
        <Link className="category-drawer__cart" href="/cart" onClick={() => setDrawer(false)}><ShoppingCart size={20} aria-hidden="true" />
          <span>{t("Корзина")}</span><strong>{hydrated ? lineCount : ""}</strong></Link>
      </CatalogDialog> : null}
    </header>
  );
}
