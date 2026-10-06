"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { lastOrderEvent, lastTracking, trackingPath } from "@/lib/tracking";

import { useCart } from "@/cart/cart-context";

export function SiteHeader() {
  const { lineCount, hydrated } = useCart();
  const pathname = usePathname();
  const [tracking, setTracking] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setTracking(lastTracking());
    read(); window.addEventListener("storage", read); window.addEventListener(lastOrderEvent, read);
    return () => { window.removeEventListener("storage", read); window.removeEventListener(lastOrderEvent, read); };
  }, []);
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;

  return (
    <header className="site-header">
      <Link className="site-logo" href="/">
        Dushanbe Fresh
      </Link>
      <nav className="site-nav" aria-label="Основная навигация">
        <Link href="/catalog">Каталог</Link>
        {tracking ? <Link href={trackingPath(tracking)}>Мой заказ</Link> : <Link className="desktop-only" href="/#categories">
          Категории
        </Link>}
        <Link className="cart-link" href="/cart" aria-label={hydrated ? `Корзина, позиций: ${lineCount}` : "Корзина"}>
          <span className="cart-icon" aria-hidden="true" />
          <span>Корзина</span>
          <strong aria-hidden={!hydrated}>{hydrated ? lineCount : ""}</strong>
        </Link>
      </nav>
    </header>
  );
}
