"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { LastOrderLink } from "./last-order-link";

import { useCart } from "@/cart/cart-context";

export function SiteHeader() {
  const { lineCount, hydrated } = useCart();
  const pathname = usePathname();
  const [logoFailed, setLogoFailed] = useState(false);
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;

  return (
    <header className="site-header">
      <Link className="site-logo" href="/" aria-label="Dushanbe Fresh">
        {logoFailed ? <span className="site-logo__fallback">Dushanbe Fresh</span> :
          <Image src="/brand/dushanbe-fresh-logo.png" alt="Dushanbe Fresh"
            width={1200} height={233} sizes="(max-width: 767px) 128px, 186px" priority
            onError={() => setLogoFailed(true)} />}
      </Link>
      <nav className="site-nav" aria-label="Основная навигация">
        <Link href="/catalog">Каталог</Link>
        <LastOrderLink />
        <Link className="cart-link" href="/cart" aria-label={hydrated ? `Корзина, позиций: ${lineCount}` : "Корзина"}>
          <ShoppingBag size={20} aria-hidden="true" />
          <span>Корзина</span>
          <strong aria-hidden={!hydrated}>{hydrated ? lineCount : ""}</strong>
        </Link>
      </nav>
    </header>
  );
}
