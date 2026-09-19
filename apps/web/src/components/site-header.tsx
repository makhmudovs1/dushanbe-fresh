"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useCart } from "@/cart/cart-context";

export function SiteHeader() {
  const { lineCount } = useCart();
  const pathname = usePathname();
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;

  return (
    <header className="site-header">
      <Link className="site-logo" href="/">
        Dushanbe Fresh
      </Link>
      <nav className="site-nav" aria-label="Основная навигация">
        <Link href="/catalog">Каталог</Link>
        <Link className="desktop-only" href="/#categories">
          Категории
        </Link>
        <Link className="cart-link" href="/cart" aria-label={`Корзина, позиций: ${lineCount}`}>
          <span className="cart-icon" aria-hidden="true" />
          <span>Корзина</span>
          <strong>{lineCount}</strong>
        </Link>
      </nav>
    </header>
  );
}
