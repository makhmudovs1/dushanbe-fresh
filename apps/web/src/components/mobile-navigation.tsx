"use client";

import Link from "next/link";
import { useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Home, Heart, LayoutGrid, ShoppingCart } from "lucide-react";
import { useCart } from "@/cart/cart-context";
import { useI18n } from "@/i18n/provider";
import { useMobileViewport } from "./use-mobile-viewport";
import { useMobileDock } from "./use-mobile-dock";
import { useProductSheetOpen } from "./mobile-product-sheet-provider";

export function MobileNavigation() {
  const pathname = usePathname();
  const params = useSearchParams();
  const { t } = useI18n();
  const { lineCount, hydrated, state } = useCart();
  const mobile = useMobileViewport();
  const sheetOpen = useProductSheetOpen();
  const ref = useRef<HTMLElement>(null);
  const hidden = sheetOpen || pathname.startsWith("/products/");
  useMobileDock(ref, mobile && !hidden && pathname !== "/checkout" && !pathname.startsWith("/admin"));
  if (pathname.startsWith("/admin") || pathname === "/checkout") return null;
  const category = params?.get("category");
  const links = [
    { href: "/", label: "Главная", Icon: Home, active: pathname === "/" },
    { href: `/categories${category ? `?category=${encodeURIComponent(category)}` : ""}`, label: "Каталог", Icon: LayoutGrid,
      active: pathname === "/categories" || pathname === "/catalog" || pathname.startsWith("/products/") },
    { href: "/favorites", label: "Избранное", Icon: Heart, active: pathname === "/favorites" },
    { href: "/cart", label: "Корзина", Icon: ShoppingCart, active: pathname === "/cart" }
  ];
  return <>
    <div className={`mobile-navigation-space${pathname === "/cart" && hydrated && state.items.length ? " mobile-navigation-space--cart" : ""}`} aria-hidden="true" />
    {mobile && !hidden ? <nav ref={ref} className="mobile-navigation" aria-label={t("Нижняя навигация")}>
      {links.map(({ href, label, Icon, active }) => <Link href={href} key={label} aria-label={t(label)} title={t(label)} aria-current={active ? "page" : undefined}>
        <span className="mobile-navigation__icon"><Icon size={23} aria-hidden="true" />
          {label === "Корзина" && hydrated && lineCount > 0 ? <span className="mobile-navigation__count" aria-label={`${t("Позиций в корзине:")} ${lineCount}`}>{lineCount}</span> : null}</span>
      </Link>)}
    </nav> : null}
  </>;
}
