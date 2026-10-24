"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Leaf, PackageCheck, Truck } from "lucide-react";
import type { Category, Product } from "@/lib/api";
import { homePromotionBanners } from "@/lib/storefront";
import { useI18n } from "@/i18n/provider";
import { PrimaryPromotion } from "./primary-promotion";

const benefits = [
  { Icon: Truck, text: "Доставка по Душанбе" },
  { Icon: Leaf, text: "Свежие продукты" },
  { Icon: PackageCheck, text: "Бережная сборка заказа" }
] as const;

export function HomePromotions({ categories, products }: { categories: Category[] | null; products: Pick<Product, "category">[] | null }) {
  const { t } = useI18n();
  const banners = homePromotionBanners(categories ?? [], products ?? []);
  return <>
    <section className="home-promotions" aria-label={t("В нашем каталоге")}>
      {banners.map(banner => banner.primary ? <PrimaryPromotion key={banner.id} banner={banner} available={Boolean(categories && products)} /> : <article id={`promotion-${banner.id}`}
        className={`promotion-banner promotion-banner--${banner.primary ? "primary" : "secondary"}`} key={banner.id}>
        <Image src={banner.image} alt={t(banner.alt)} fill priority={banner.primary}
          sizes={banner.primary ? "(max-width: 1023px) 100vw, 720px" : "(max-width: 1023px) 100vw, 440px"} />
        <div className="promotion-banner__content">
          <h2>{t(banner.title)}</h2>
          {banner.href ? <Link href={banner.href}>{t(banner.action)}<ArrowRight size={18} aria-hidden="true" /></Link> :
            categories && products ? <span className="promotion-banner__soon">{t("Скоро в магазине")}</span> : null}
        </div>
      </article>)}
    </section>
    <ul className="home-benefits" aria-label={t("Почему Dushanbe Fresh")}>
      {benefits.map(({ Icon, text }) => <li key={text}><Icon size={20} aria-hidden="true" /><span>{t(text)}</span></li>)}
    </ul>
  </>;
}
