"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";
import { Home, Heart, LayoutGrid, ShoppingCart, UserRound } from "lucide-react";
import { useCart } from "@/cart/cart-context";
import { useI18n } from "@/i18n/provider";
import { useMobileViewport } from "./use-mobile-viewport";
import { useMobileNavigationDock } from "./mobile-navigation-dock";

export function MobileNavigation() {
  const pathname = usePathname();
  const params = useSearchParams();
  const { t } = useI18n();
  const { lineCount, hydrated, state } = useCart();
  const mobile = useMobileViewport();
  const dock = useMobileNavigationDock();
  if (pathname.startsWith("/admin")) return null;
  const category = params?.get("category");
  const links = [
    { href: "/", label: "Главная", Icon: Home, active: pathname === "/" && !dock },
    { href: `/categories${category ? `?category=${encodeURIComponent(category)}` : ""}`, label: "Каталог", Icon: LayoutGrid,
      active: pathname === "/categories" || pathname === "/catalog" || pathname.startsWith("/products/") || !!dock },
    { href: "/favorites", label: "Избранное", Icon: Heart, active: pathname === "/favorites" && !dock },
    { href: "/cart", label: "Корзина", Icon: ShoppingCart, active: (pathname === "/cart" || pathname === "/checkout") && !dock },
    { href: "/account", label: "Профиль", Icon: UserRound, active: pathname === "/account" && !dock }
  ];
  const navigation = mobile ? <nav className={`mobile-navigation${dock ? " mobile-navigation--docked" : ""}`} aria-label={t("Нижняя навигация")}>
    {links.map(({ href, label, Icon, active }) => <Link href={href} key={label} aria-label={t(label)} title={t(label)} aria-current={active ? "page" : undefined}
      onClick={event => {
        if (dock && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
          event.preventDefault(); dock.navigate(href);
        }
      }}>
      <span className="mobile-navigation__icon"><Icon size={23} aria-hidden="true" />
        {label === "Корзина" && hydrated && lineCount > 0 ? <span className="mobile-navigation__count" aria-label={`${t("Позиций в корзине:")} ${lineCount}`}>{lineCount}</span> : null}</span>
    </Link>)}
  </nav> : null;
  return <>
    <div className={`mobile-navigation-space${pathname === "/cart" && hydrated && state.items.length ? " mobile-navigation-space--cart" : ""}`} aria-hidden="true" />
    {dock ? createPortal(navigation, dock.element) : navigation}
  </>;
}
