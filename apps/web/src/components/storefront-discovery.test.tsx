import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CategoryShowcase } from "./home-category-sections";
import { HomeQuickLinks } from "./home-quick-links";
import { FavoritesBrowser } from "./favorites-browser";
import { LanguageProvider } from "@/i18n/provider";
import type { Category, Product } from "@/lib/api";

const favorites = vi.hoisted(() => ({ ids: [] as string[], ready: true }));
vi.mock("@/favorites/favorites-context", () => ({ useFavorites: () => favorites }));
vi.mock("next/navigation", () => ({ usePathname: () => "/categories", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ refresh: vi.fn() }) }));
const categories: Category[] = [
  { id: "veg", slug: "vegetables", name: "Овощи", sortOrder: 0 },
  { id: "greens", slug: "greens", name: "Зелень", sortOrder: 1 },
  { id: "hidden", slug: "hidden", name: "Скрытая", sortOrder: 2, isVisible: false }
];
const products: Product[] = categories.map(category => ({ id: category.id, name: category.name, slug: category.slug, category,
  sellingPrice: "7", priceDrop: null, description: null, image: null, unit: "kg", isWeighted: true,
  minQuantity: "0.5", quantityStep: "0.5", qualityOptions: [] }));

describe("storefront discovery", () => {
  beforeEach(() => { favorites.ids = []; favorites.ready = true; });
  it("shares real populated grouped category tiles, without a vertical menu or duplicates", () => {
    const html = renderToStaticMarkup(<CategoryShowcase categories={categories} products={products} />);
    expect(html).toContain("Овощные продукты");
    expect(html.match(/class="storefront-category /g)).toHaveLength(2);
    expect(html).toContain("category=vegetables");
    expect(html).toContain("category=greens");
    expect(html).not.toContain("Скрытая");
    expect(html).not.toContain("catalog-sidebar");
  });
  it("does not fabricate discounts or purchase history", () => {
    const html = renderToStaticMarkup(<HomeQuickLinks products={products} />);
    expect(html).toContain('href="/account?section=orders"');
    expect(html).toContain('href="/favorites"');
    expect(html).not.toContain("Скидки");
    const discount = { ...products[0], priceDrop: { oldPrice: "9", discountPercent: 22 } };
    expect(renderToStaticMarkup(<HomeQuickLinks products={[discount]} />)).toContain('href="/catalog?collection=discounts"');
  });
  it("renders an illustrated personal shelf while preserving errors and unavailable saved items", () => {
    const html = renderToStaticMarkup(<FavoritesBrowser products={[]} />);
    expect(html).toContain("Это ваша личная полка");
    expect(html).toContain("favorites-empty__art");
    expect(html).not.toContain("В избранном пока пусто");
    expect(renderToStaticMarkup(<FavoritesBrowser products={null} />)).toContain('role="alert"');
    favorites.ids = ["unavailable"];
    expect(renderToStaticMarkup(<FavoritesBrowser products={[]} />)).toContain("Избранные товары сейчас недоступны");
    favorites.ready = false;
    expect(renderToStaticMarkup(<FavoritesBrowser products={[]} />)).not.toContain("favorites-empty");
  });
  it("localizes the empty shelf and shortcuts to Tajik", () => {
    const html = renderToStaticMarkup(<LanguageProvider initialLocale="tg"><HomeQuickLinks products={[]} /><FavoritesBrowser products={[]} /></LanguageProvider>);
    expect(html).toContain("Ин рафи шахсии шумост");
    expect(html).toContain("Қаблан харидед");
    expect(html).not.toContain("Это ваша личная полка");
  });
});
