import { describe, expect, it } from "vitest";
import { decimalLabel, priceUnitLabel, quantityUnit } from "./format";
const {
  decimalLabel: webDecimal,
  priceUnitLabel: webPriceUnit,
  unitLabel: webUnit,
} = await import(new URL("../../../web/src/lib/format.ts", import.meta.url).href);
import {
  homeCategorySections,
  homePromotionBanners,
} from "../../../web/src/lib/storefront";
import { productPhotos as webPhotos } from "../../../web/src/lib/product-gallery";
import {
  categorySections,
  populatedCategory,
  productPhotos,
} from "./storefront";
import { potato } from "../domain/fixtures.test-support";
import type { Category } from "../domain/catalog";
import { catalogLayout } from "../domain/catalog-layout";
const categories: Category[] = [
  { id: "vegetables", slug: "vegetables", name: "Овощи", sortOrder: 1 },
  { id: "greens", slug: "greens", name: "Зелень", sortOrder: 3 },
  { id: "fruit", slug: "fruits", name: "Фрукты", sortOrder: 4 },
  {
    id: "apple",
    slug: "apples",
    name: "Яблоки",
    sortOrder: 5,
    parentId: "fruit",
  },
  {
    id: "hidden",
    slug: "hidden",
    name: "Скрытая",
    sortOrder: 0,
    isVisible: false,
  },
  { id: "empty", slug: "empty", name: "Пустая", sortOrder: 2 },
];
const products = [
  potato,
  ...["greens", "apple", "hidden"].map((id) => ({
    ...potato,
    id,
    category: { id, slug: id, name: id },
  })),
];
describe("WEB/MOBILE presentation contract", () => {
  it("uses identical decimal labels without rounding API prices", () => {
    for (const x of ["0", "6.9", "0.500", "6.30", "1000000.99", "23.00"])
      expect(decimalLabel(x)).toBe(webDecimal(x));
  });
  it("matches RU/TJ price units and bunch grammar", () => {
    for (const locale of ["ru", "tg"] as const)
      for (const unit of ["kg", "g", "piece", "pack", "bunch", "unknown"]) {
        for (const quantity of [undefined, "1", "2", "5", "11", "21", "0.5"])
          expect(quantityUnit(unit, locale, quantity)).toBe(
            webUnit(unit, quantity, locale),
          );
        for (const slug of ["basil", "mint", "apple"])
          expect(priceUnitLabel(unit, locale, slug)).toBe(
            webPriceUnit(unit, locale, slug),
          );
      }
  });
  it("groups populated categories, descendants and vegetables/greens like WEB", () => {
    expect(categorySections(categories, products)).toEqual(
      homeCategorySections(categories as never, products as never),
    );
    expect(
      categorySections(categories, products).flatMap((s) =>
        s.tiles.map((c) => c.id),
      ),
    ).not.toContain("hidden");
    expect(
      categorySections(categories, products).flatMap((s) =>
        s.tiles.map((c) => c.id),
      ),
    ).not.toContain("empty");
  });
  it("does not invent availability for promotional categories", () => {
    for (const banner of homePromotionBanners(
      categories as never,
      products as never,
    )) {
      const slugs =
        banner.id === "vegetables"
          ? ["vegetables", "greens"]
          : banner.id === "fruits"
            ? ["fruits"]
            : ["dairy", "milk-products", "dairy-products"];
      const slug = populatedCategory(categories, products, slugs)?.slug;
      expect(slug ? `/catalog?category=${slug}` : null).toBe(banner.href);
    }
  });
  it("matches primary gallery order and does not prepend stale cover images", () => {
    const p = {
      ...potato,
      image: "/stale.webp",
      images: [
        { id: "b", url: "/b.webp", sortOrder: 0, isPrimary: false },
        { id: "a", url: "/a.webp", sortOrder: 1, isPrimary: true },
      ],
    };
    expect(productPhotos(p)).toEqual(webPhotos(p as never).map((p) => p.url));
    expect(productPhotos(p)[0]).toBe("/a.webp");
  });
  it.each([
    [375, 166.5],
    [390, 174],
    [430, 194],
  ])("matches measured WEB product widths at %ipx", (width, expected) => {
    expect(catalogLayout(width!, 1)).toEqual({
      columns: 2,
      cardWidth: expected,
    });
  });
});
