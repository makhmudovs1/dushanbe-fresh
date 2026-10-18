import { categoryDescendantIds, visibleCategoryTree } from "@dushanbe-fresh/shared";
import type { Category, Product } from "./api";

export function homeCategorySections(categories: Category[], products: Pick<Product, "category">[]) {
  const visible = visibleCategoryTree(categories);
  const populated = (category: Category) => {
    const ids = new Set(categoryDescendantIds(visible, category.id));
    return products.some(product => ids.has(product.category.id));
  };
  const roots = visible.filter(category => !category.parentId && populated(category));
  const vegetables = roots.find(category => category.slug === "vegetables");
  const greens = roots.find(category => category.slug === "greens");
  const combined = vegetables && greens;
  return roots.filter(category => !combined || category.id !== greens.id).map(category => {
    const members = combined && category.id === vegetables.id ? [vegetables, greens] : [category];
    const tiles = members.flatMap(member => {
      const children = visible.filter(child => child.parentId === member.id && populated(child));
      const ownProducts = products.some(product => product.category.id === member.id);
      return ownProducts || !children.length ? [member, ...children] : children;
    });
    return { category, tiles, titleKey: category.slug === "vegetables" ? "Овощные продукты" : null,
      sortOrder: Math.min(...members.map(member => member.sortOrder)) };
  }).sort((a, b) => a.sortOrder - b.sortOrder || a.category.name.localeCompare(b.category.name, "ru"));
}

const promotionBanners = [
  { id: "vegetables", slugs: ["vegetables", "greens"], image: "/storefront/home/vegetables.webp", title: "Овощи и зелень", text: "К вашему столу", action: "К покупкам", alt: "Помидоры, огурцы и свежая зелень", primary: true },
  { id: "fruits", slugs: ["fruits"], image: "/storefront/home/fruits.webp", title: "Фрукты к вашему столу", text: "", action: "Выбрать", alt: "Бананы, яблоко и мандарин", primary: false },
  { id: "dairy", slugs: ["dairy", "milk-products", "dairy-products"], image: "/storefront/home/dairy.webp", title: "Молочные продукты", text: "", action: "Смотреть", alt: "Молоко, творог и сыр", primary: false }
] as const;

export function homePromotionBanners(categories: Category[], products: Pick<Product, "category">[]) {
  const visible = visibleCategoryTree(categories);
  return promotionBanners.map(banner => {
    const category = banner.slugs.map(slug => visible.find(item => item.slug === slug)).find(item => item &&
      products.some(product => categoryDescendantIds(visible, item.id).includes(product.category.id)));
    return { ...banner, href: category ? `/catalog?category=${encodeURIComponent(category.slug)}` : null };
  });
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
