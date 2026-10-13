"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import type { Product } from "@/lib/api";
import { productPhotos, swipeDirection } from "@/lib/product-gallery";
import { photoAttribution } from "@/lib/photo-attribution";
import { useI18n } from "@/i18n/provider";
import { ProductImage } from "./product-image";

export function ProductGallery({ product, href, eager = false, children }: {
  product: Product; href?: string; eager?: boolean; children?: ReactNode;
}) {
  const { name, t, locale } = useI18n();
  const photos = productPhotos(product);
  const [index, setIndex] = useState(0);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const suppressClickUntil = useRef(0);
  const photoKey = photos.map(photo => photo.url).join("|");
  useEffect(() => { setIndex(0); }, [product.id, photoKey]);
  const active = Math.min(index, Math.max(0, photos.length - 1));
  function move(direction: number) { setIndex(current => (current + direction + photos.length) % photos.length); }
  const image = <ProductImage src={photos[active]?.url ?? null} name={name(product)} eager={eager} />;
  const credit = photoAttribution(photos[active]?.url);
  const creditLabel = locale === "tg" ? "Муаллиф ва иҷозатномаи акс" : "Автор и лицензия фото";

  return <div className={href ? "product-gallery" : "product-gallery product-gallery--detail"}>
    <div className="product-gallery__media" onTouchStart={event => {
      suppressClickUntil.current = 0;
      touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }} onTouchEnd={event => {
      if (!touch.current || photos.length < 2) return;
      const direction = swipeDirection(event.changedTouches[0].clientX - touch.current.x, event.changedTouches[0].clientY - touch.current.y);
      touch.current = null;
      if (direction) { suppressClickUntil.current = Date.now() + 500; move(direction); }
    }} onTouchCancel={() => { touch.current = null; }}>
      {href ? <Link className="product-gallery__link" href={href} aria-label={name(product)} onClick={event => {
        if (event.detail > 0 && Date.now() < suppressClickUntil.current) event.preventDefault();
      }}>{image}</Link> : image}
      {children}
      {credit ? <details className="product-gallery__credit" key={credit.imageUrl}>
        <summary aria-label={creditLabel} title={creditLabel}><Info size={18} aria-hidden="true" /></summary>
        <div>
          <a href={credit.sourceUrl} target="_blank" rel="noopener noreferrer">{credit.author}</a>
          <a href={credit.licenseUrl} target="_blank" rel="license noopener noreferrer">{credit.license}</a>
          <small>{locale === "tg" ? "Акс барои каталог коркард шудааст." : "Фото обработано для каталога."}</small>
        </div>
      </details> : null}
      {photos.length > 1 ? <div className="product-gallery__arrows">
        <button type="button" aria-label={t("Предыдущее фото")} title={t("Предыдущее фото")} onClick={() => move(-1)}><ChevronLeft size={18} /></button>
        <button type="button" aria-label={t("Следующее фото")} title={t("Следующее фото")} onClick={() => move(1)}><ChevronRight size={18} /></button>
      </div> : null}
    </div>
    {photos.length > 1 ? <div className="product-gallery__dots" role="group" aria-label={`${t("Фотографии товара")}: ${name(product)}`}>
      {photos.map((photo, position) => <button key={photo.url} type="button" aria-label={`${t("Фото")} ${position + 1}: ${name(product)}`}
        aria-pressed={position === active} onClick={() => setIndex(position)}><span /></button>)}
    </div> : null}
  </div>;
}
