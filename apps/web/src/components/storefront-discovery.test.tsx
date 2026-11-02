import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CategoryShowcase } from "./home-category-sections";
import { HomeQuickLinks } from "./home-quick-links";
import { CategorySidebar } from "./category-sidebar";
import { FavoritesBrowser } from "./favorites-browser";
import { LanguageProvider } from "@/i18n/provider";
import type { Category, Product } from "@/lib/api";

const favorites = vi.hoisted(() => ({ ids: [] as string[], ready: true }));
const route = vi.hoisted(() => ({ pathname: "/categories", query: "" }));
vi.mock("@/favorites/favorites-context", () => ({ useFavorites: () => favorites }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useSearchParams: () => new URLSearchParams(route.query), useRouter: () => ({ refresh: vi.fn() }) }));
const categories: Category[] = [
  { id: "veg", slug: "vegetables", name: "Овощи", sortOrder: 0 },
  { id: "greens", slug: "greens", name: "Зелень", sortOrder: 1 },
  { id: "hidden", slug: "hidden", name: "Скрытая", sortOrder: 2, isVisible: false }
];
const products: Product[] = categories.map(category => ({ id: category.id, name: category.name, slug: category.slug, category,
  sellingPrice: "7", priceDrop: null, description: null, image: null, unit: "kg", isWeighted: true,
  minQuantity: "0.5", quantityStep: "0.5", qualityOptions: [] }));
const discount: Product = { ...products[0], priceDrop: { oldPrice: "9", discountPercent: 22 } };

function sidebarMarkup(data: Product[] | null = products, categoryScreen = false, availableCategories: Category[] | null = categories) {
  return renderToStaticMarkup(<CategorySidebar categories={availableCategories} categoryScreen={categoryScreen} fullProducts={data} />);
}

function sectionLinks(html: string) {
  const nav = html.match(/<nav[^>]*class="catalog-sidebar__sections"[^>]*>(.*?)<\/nav>/)?.[1] ?? html;
  return [...nav.matchAll(/<a\b([^>]*)>(.*?)<\/a>/g)];
}

describe("storefront discovery", () => {
  beforeEach(() => { favorites.ids = []; favorites.ready = true; route.pathname = "/categories"; route.query = ""; });
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
  it("shares shortcut routes, labels and icons without duplicate sidebar rows", () => {
    const sidebar = sectionLinks(sidebarMarkup([discount]));
    const mobile = sectionLinks(renderToStaticMarkup(<HomeQuickLinks products={[discount]} />));
    expect(sidebar).toHaveLength(4);
    for (const link of sidebar) {
      const href = link[1].match(/href="([^"]+)"/)?.[0];
      const shortcut = mobile.find(item => item[1].includes(href!))!;
      expect(shortcut).toBeTruthy();
      expect(link[2]).toContain(shortcut[2].match(/<span>(.*?)<\/span>/)?.[1]);
      expect(link[2].match(/lucide-[a-z-]+/)?.[0]).toBe(shortcut[2].match(/lucide-[a-z-]+/)?.[0]);
      const fill = href === 'href="/favorites"' ? "currentColor" : "none";
      expect(link[2]).toContain(`fill="${fill}"`);
      expect(shortcut[2]).toContain(`fill="${fill}"`);
    }
    expect(sidebar.filter(link => link[1].includes('href="/favorites"'))).toHaveLength(1);
    expect(sidebar.filter(link => link[1].includes('href="/catalog"'))).toHaveLength(1);
    expect(sidebarMarkup([discount])).not.toContain("is-active");
    expect(sectionLinks(sidebarMarkup([discount], true))).toHaveLength(4);
  });
  it.each([null, [], products, [{ ...discount, priceDrop: { oldPrice: "7", discountPercent: 22 } }],
    [{ ...discount, priceDrop: { oldPrice: "6", discountPercent: 22 } }],
    [{ ...discount, priceDrop: { oldPrice: "9", discountPercent: 0 } }]])("does not offer discounts without a verified price drop: %j", data => {
    expect(sidebarMarkup(data as Product[] | null)).not.toContain('href="/catalog?collection=discounts"');
    expect(renderToStaticMarkup(<HomeQuickLinks products={data as Product[] | null} />)).not.toContain('href="/catalog?collection=discounts"');
  });
  it.each([
    ["/catalog", "", "/catalog"],
    ["/catalog", "collection=discounts", "/catalog?collection=discounts"],
    ["/catalog", "collection=discounts&category=greens", "/catalog?collection=discounts"],
    ["/catalog", "category=greens", null],
    ["/catalog", "search=apple", null],
    ["/catalog", "collection=other", null],
    ["/favorites", "", "/favorites"],
    ["/account", "section=orders", "/account?section=orders"],
    ["/account", "section=profile", null],
    ["/categories", "", null]
  ])("marks only the exact shortcut active for %s?%s", (pathname, query, href) => {
    route.pathname = pathname; route.query = query;
    const active = sectionLinks(sidebarMarkup([discount])).filter(link => link[1].includes('aria-current="page"'));
    expect(active).toHaveLength(href ? 1 : 0);
    if (href) { expect(active[0][1]).toContain(`href="${href}"`); expect(active[0][1]).toContain("is-active"); }
  });
  it("uses the full catalog for discounts even on another category and preserves category errors", () => {
    route.pathname = "/catalog"; route.query = "category=greens";
    const html = sidebarMarkup([discount, products[1]]);
    expect(html).toContain('href="/catalog?collection=discounts"');
    expect(html).toContain('title="Зелень" aria-current="page"');
    const failed = sidebarMarkup(null, false, null);
    expect(failed).toContain("Не удалось загрузить категории");
    expect(sectionLinks(failed)).toHaveLength(3);
    expect(failed).not.toContain('href="/catalog?collection=discounts"');
  });
  it("localizes all desktop shortcuts using the mobile RU/TJ source", () => {
    const html = renderToStaticMarkup(<LanguageProvider initialLocale="tg">
      <CategorySidebar categories={categories} fullProducts={[discount]} />
    </LanguageProvider>);
    for (const label of ["Қаблан харидед", "Маҳбубҳо", "Тахфифҳо", "Ҳамаи маҳсулот"]) expect(html).toContain(label);
    for (const label of ["Уже брали", "Любимое", "Скидки", "Все продукты"]) expect(html).not.toContain(label);
  });
  it("preserves both category and discount selection when both filters are present", () => {
    route.pathname = "/catalog"; route.query = "category=greens&collection=discounts";
    const html = sidebarMarkup([discount]);
    expect(html).toContain('title="Зелень" aria-current="page"');
    expect(sectionLinks(html).find(link => link[1].includes('href="/catalog?collection=discounts"'))?.[1]).toContain('aria-current="page"');
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
