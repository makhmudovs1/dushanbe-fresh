"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LastOrderLink } from "./last-order-link";

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;
  return <footer className="site-footer"><div className="shell site-footer__inner">
    <div><Link className="site-footer__brand" href="/">Dushanbe Fresh</Link>
      <p>Свежие продукты с рынков Душанбе с доставкой домой.</p>
    </div>
    <nav aria-label="Навигация в подвале">
      <Link href="/catalog">Каталог</Link><Link href="/about">О сервисе</Link><LastOrderLink />
    </nav>
    <small>© 2026 Dushanbe Fresh</small>
  </div></footer>;
}
