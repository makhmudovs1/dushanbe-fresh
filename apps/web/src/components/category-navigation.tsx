"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Category } from "@/lib/api";
import { categoryArtwork } from "@/lib/storefront";
import { useI18n } from "@/i18n/provider";
export { CategorySidebar } from "./category-sidebar";

export function CategoryImage({ category }: { category: Category }) {
  const { name } = useI18n();
  const artwork = categoryArtwork(category);
  const [failed, setFailed] = useState<string | null>(null);
  const source = failed === artwork.image ? "/brand/icon-v3.png" : artwork.image;
  return <Image src={source} width={640} height={480} alt={name(category)}
    sizes="(max-width: 767px) 50vw, (max-width: 1023px) 25vw, 280px"
    className={source.includes("/brand/") ? "category-image category-image--placeholder" : "category-image"}
    style={{ objectPosition: artwork.position }} unoptimized={source.startsWith("https:")}
    onError={() => setFailed(artwork.image)} />;
}

export function CategoryCards({ categories }: { categories: Category[] | null }) {
  const { t, name } = useI18n();
  const router = useRouter();
  if (categories === null) return <div className="notice" role="status"><p>{t("Не удалось загрузить категории. Попробуйте ещё раз.")}</p>
    <button type="button" className="secondary-link" onClick={() => router.refresh()}>{t("Повторить")}</button></div>;
  const visible = categories.filter(category => category.isVisible !== false && category.isActive !== false);
  return <>
    {visible.length ? <div className="storefront-categories">{visible.map(category =>
      <Link href={`/catalog?category=${encodeURIComponent(category.slug)}`} className={`storefront-category storefront-category--${categoryArtwork(category).tone}`} key={category.id} aria-label={name(category)}>
        <strong>{name(category)}</strong><span className="storefront-category__image"><CategoryImage category={category} /></span>
      </Link>)}</div> : <p>{t("Категории пока не добавлены.")}</p>}
  </>;
}
