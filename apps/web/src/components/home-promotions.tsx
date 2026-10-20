"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowRight, Leaf, PackageCheck, Truck } from "lucide-react";
import type { Category, Product } from "@/lib/api";
import { homePromotionBanners } from "@/lib/storefront";
import { useI18n } from "@/i18n/provider";

const benefits = [
  { Icon: Truck, text: "Доставка по Душанбе" },
  { Icon: Leaf, text: "Свежие продукты" },
  { Icon: PackageCheck, text: "Бережная сборка заказа" }
] as const;

export function HomePromotions({ categories, products }: { categories: Category[] | null; products: Pick<Product, "category">[] | null }) {
  const { t } = useI18n();
  const track = useRef<HTMLElement>(null);
  const [slide, setSlide] = useState(0);
  const banners = homePromotionBanners(categories ?? [], products ?? []);
  return <>
    <section className="home-promotions" aria-label={t("В нашем каталоге")} ref={track} onScroll={event => {
      const element = event.currentTarget;
      const first = element.firstElementChild as HTMLElement | null;
      if (first) setSlide(Math.round(element.scrollLeft / (first.offsetWidth + parseFloat(getComputedStyle(element).columnGap || "0"))));
    }}>
      {banners.map((banner, index) => <article id={`promotion-${banner.id}`}
        className={`promotion-banner promotion-banner--${banner.primary ? "primary" : "secondary"}`} key={banner.id}>
        <Image src={banner.image} alt={t(banner.alt)} fill priority={banner.primary}
          sizes={banner.primary ? "(max-width: 1023px) 100vw, 720px" : "(max-width: 1023px) 100vw, 440px"} />
        <div className="promotion-banner__content">
          {banner.primary ? <h1>{t(banner.title)}</h1> : <h2>{t(banner.title)}</h2>}
          {banner.text ? <p>{t(banner.text)}</p> : null}
          {banner.href ? <Link href={banner.href} onFocus={() => { if (track.current && matchMedia("(max-width: 1023px)").matches) track.current.scrollLeft = index * (track.current.clientWidth + 12); }}>{t(banner.action)}<ArrowRight size={18} aria-hidden="true" /></Link> :
            categories && products ? <span className="promotion-banner__soon">{t("Скоро в магазине")}</span> : null}
        </div>
      </article>)}
    </section>
    <div className="home-promotion-dots" role="group" aria-label={t("Баннеры")}>
      {banners.map((banner, index) => <button key={banner.id} type="button" aria-label={t(banner.title)} aria-controls={`promotion-${banner.id}`} aria-pressed={slide === index}
        onClick={() => {
          const element = track.current;
          if (element) element.scrollTo({ left: index * (element.clientWidth + 12), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        }}><span /></button>)}
    </div>
    <ul className="home-benefits" aria-label={t("Почему Dushanbe Fresh")}>
      {benefits.map(({ Icon, text }) => <li key={text}><Icon size={20} aria-hidden="true" /><span>{t(text)}</span></li>)}
    </ul>
  </>;
}
