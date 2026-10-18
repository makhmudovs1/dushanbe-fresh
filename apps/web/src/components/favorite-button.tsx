"use client";

import { Heart } from "lucide-react";
import { useFavorites } from "@/favorites/favorites-context";
import { useI18n } from "@/i18n/provider";
import type { Product } from "@/lib/api";

export function FavoriteButton({ product }: { product: Pick<Product, "id" | "name" | "nameTj"> }) {
  const { ids, ready, toggle } = useFavorites();
  const { t, name } = useI18n();
  const active = ids.includes(product.id);
  const label = `${t(active ? "Убрать из избранного" : "Добавить в избранное")}: ${name(product)}`;
  return <button type="button" className="favorite-button" aria-label={label} title={label} aria-pressed={ready && active}
    disabled={!ready} onClick={() => toggle(product.id)}><Heart size={21} fill={ready && active ? "currentColor" : "none"} aria-hidden="true" /></button>;
}
