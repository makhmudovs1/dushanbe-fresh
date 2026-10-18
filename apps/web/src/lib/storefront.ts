import { categoryDescendantIds } from "@dushanbe-fresh/shared";
import type { Category, Product } from "./api";

export function featuredCategories(categories: Category[], products: Pick<Product, "category">[]) {
  const sizes = new Map(categories.filter(category => !category.parentId).map(category => {
    const ids = new Set(categoryDescendantIds(categories, category.id));
    return [category.id, products.filter(product => ids.has(product.category.id)).length];
  }));
  return categories.filter(category => !category.parentId).sort((a, b) =>
    a.sortOrder - b.sortOrder || (sizes.get(b.id) ?? 0) - (sizes.get(a.id) ?? 0)).slice(0, 4);
}

// Launch artwork is replaceable by a category upload; the list still comes from the API.
const artwork: Record<string, { image: string; position: string; tone: string }> = {
  vegetables: { image: "/storefront/v2/vegetables.webp", position: "50% 65%", tone: "mint" },
  fruits: { image: "/storefront/v2/fruits.webp", position: "50% 65%", tone: "blue" },
  greens: { image: "/storefront/v2/greens.webp", position: "50% 65%", tone: "mint" },
  "nuts-dried-fruits": { image: "/storefront/v2/nuts.webp", position: "50% 65%", tone: "pink" },
  legumes: { image: "/storefront/pantry.webp", position: "50% 95%", tone: "sand" },
  mushrooms: { image: "/storefront/v2/mushrooms.webp", position: "50% 65%", tone: "mint" },
  "seasonal-vegetables": { image: "/storefront/v2/seasonal-vegetables.webp", position: "50% 65%", tone: "mint" }
};

export function categoryArtwork(category: Pick<Category, "slug" | "imageUrl">) {
  return { image: category.imageUrl || artwork[category.slug]?.image || "/brand/icon-v2.png",
    position: category.imageUrl ? "center" : artwork[category.slug]?.position || "center",
    tone: artwork[category.slug]?.tone || "blue" };
}

export const homeBanners = [
  { id: "fruit", image: "/storefront/pomegranates.webp", title: "Гранаты", text: "Выбирайте фрукты в нашем каталоге.",
    action: "К покупкам", href: "/catalog?category=fruits", alt: "Гранаты на рыночном прилавке", primary: true },
  { id: "herbs", image: "/storefront/herbs-banner.webp", title: "Свежая зелень", text: "Для ваших повседневных блюд.",
    action: "Смотреть", href: "/catalog?category=greens", alt: "Свежая зелень в корзине", primary: false }
] as const;
