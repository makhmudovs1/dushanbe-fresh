"use client";

import Link from "next/link";
import type { Product } from "@/lib/api";
import { useI18n } from "@/i18n/provider";
import { storefrontQuickLinks } from "./storefront-quick-links";

export function HomeQuickLinks({ products }: { products: Product[] | null }) {
  const { t } = useI18n();
  return <nav className="home-quick-links" aria-label={t("Подборки продуктов")}>
    {storefrontQuickLinks(products).map(({ id, href, label, Icon }) => <Link key={id} href={href}
      className={id === "favorites" || id === "discounts" ? `home-quick-links__${id}` : undefined}>
      <Icon size={22} fill={id === "favorites" ? "currentColor" : "none"} aria-hidden="true" /><span>{t(label)}</span>
    </Link>)}
  </nav>;
}
