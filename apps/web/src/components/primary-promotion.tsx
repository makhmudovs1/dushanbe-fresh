"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/i18n/provider";

type Promotion = { image: string; alt: string; title: string; text?: string; action: string; href?: string | null };

export function PrimaryPromotion({ banner, available }: { banner: Promotion; available: boolean }) {
  const { t } = useI18n();
  const track = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  const [interacting, setInteracting] = useState(false);
  const slides: Promotion[] = [banner, {
    image: "/storefront/home/care-v1.webp", alt: "Пакет Dushanbe Fresh со свежими продуктами",
    title: "Продукты с заботой", text: "Доставляем свежесть по Душанбе", action: "Перейти", href: "/catalog"
  }];

  function goTo(index: number) {
    const element = track.current;
    if (element) element.scrollTo({ left: index * element.clientWidth, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function updateInteraction(element: HTMLElement) {
    setInteracting((matchMedia("(hover: hover)").matches && element.matches(":hover")) || Boolean(element.querySelector(":focus-visible")));
  }

  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    if (interacting) return;
    const timer = window.setInterval(() => {
      if (!document.hidden && !motion.matches) goTo((slide + 1) % 2);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [slide, interacting]);

  // Keep the selected slide aligned after rotation/resizing, without a second scroll animation.
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== width) {
        width = element.clientWidth;
        element.scrollTo({ left: slide * width, behavior: "auto" });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [slide]);

  return <article id="promotion-vegetables" className="promotion-banner promotion-banner--primary promotion-carousel"
    aria-roledescription={t("Карусель")} aria-label={t("Баннеры")}
    onPointerEnter={event => updateInteraction(event.currentTarget)} onPointerLeave={event => updateInteraction(event.currentTarget)}
    onFocusCapture={event => updateInteraction(event.currentTarget)} onBlurCapture={event => updateInteraction(event.currentTarget)}
    onTouchStart={() => setInteracting(true)} onTouchEnd={event => updateInteraction(event.currentTarget)} onTouchCancel={event => updateInteraction(event.currentTarget)}>
    <div ref={track} className="promotion-carousel__track"
      onScroll={event => {
        const element = event.currentTarget;
        if (element.clientWidth) setSlide(Math.round(element.scrollLeft / element.clientWidth));
      }}>
      {slides.map((item, index) => <div className={`promotion-carousel__slide${index === 1 ? " promotion-carousel__slide--care" : ""}`}
        key={item.image} role="group" aria-roledescription={t("Слайд")} aria-label={`${index + 1} / 2`} aria-hidden={slide !== index}>
        <Image src={item.image} alt={t(item.alt)} fill priority sizes="(max-width: 599px) 50vw, (max-width: 1023px) 50vw, 720px" />
        <div className="promotion-banner__content">
          {index === 0 ? <h1>{t(item.title)}</h1> : <h2>{t(item.title)}</h2>}
          {item.text ? <p>{t(item.text)}</p> : null}
          {item.href ? <Link href={item.href} tabIndex={slide === index ? 0 : -1}>{t(item.action)}<ArrowRight size={18} aria-hidden="true" /></Link>
            : available ? <span className="promotion-banner__soon">{t("Скоро в магазине")}</span> : null}
        </div>
      </div>)}
    </div>
    <div className="promotion-carousel__controls">
      {slides.map((item, index) => <button key={item.image} type="button" aria-label={t(item.title)} aria-pressed={slide === index}
        onClick={() => goTo(index)}><span /></button>)}
    </div>
  </article>;
}
