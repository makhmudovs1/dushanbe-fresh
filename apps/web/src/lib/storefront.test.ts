import { describe, expect, it } from "vitest";
import { categoryArtwork, hasPriceDrop, homeCategorySections, homeBanners, homePromotionBanners, mobileHomeCategories } from "./storefront";
import { translate } from "@/i18n/locale";
import type { Category } from "./api";

const category = (slug: string, sortOrder = 0, extra: Partial<Category> = {}): Category => ({ id: slug, slug, name: slug, sortOrder, ...extra });
const products = (...ids: string[]) => ids.map(id => ({ category: { id, slug: id, name: id } }));

describe("storefront configuration", () => {
  it("offers discounts only when the real previous price is higher", () => {
    expect(hasPriceDrop({ sellingPrice: "7", priceDrop: { oldPrice: "9", discountPercent: 22 } })).toBe(true);
    expect(hasPriceDrop({ sellingPrice: "7", priceDrop: null })).toBe(false);
    expect(hasPriceDrop({ sellingPrice: "7", priceDrop: { oldPrice: "7", discountPercent: 10 } })).toBe(false);
    expect(hasPriceDrop({ sellingPrice: "7", priceDrop: { oldPrice: "6", discountPercent: 10 } })).toBe(false);
  });
  it("keeps mobile roots and populated child selections separate without repeated tiles", () => {
    const categories = [category("fruit", 10), category("vegetables", 0), category("child", 0, { parentId: "vegetables" }), category("empty", 0, { parentId: "vegetables" })];
    const result = mobileHomeCategories(categories, products("fruit", "child"));
    expect(result.roots.map(item => item.id)).toEqual(["vegetables", "fruit"]);
    expect(result.sections.map(section => [section.category.id, section.tiles.map(item => item.id)])).toEqual([["vegetables", ["child"]]]);
    expect(new Set([...result.roots, ...result.sections.flatMap(section => section.tiles)].map(item => item.id)).size).toBe(3);
  });
  it("excludes unpublished mobile categories, their children and empty roots", () => {
    expect(mobileHomeCategories([category("empty"), category("hidden", 0, { isVisible: false }), category("child", 0, { parentId: "hidden" })], products("child"))).toEqual({ roots: [], sections: [] });
  });
  it("combines real vegetable and herb roots without creating or changing categories", () => {
    const categories = [category("vegetables", 10), category("fruits", 20), category("greens", 30)];
    const result = homeCategorySections(categories, products("vegetables", "fruits", "greens"));
    expect(result.map(section => section.category.slug)).toEqual(["vegetables", "fruits"]);
    expect(result[0].titleKey).toBe("Овощные продукты");
    expect(result[0].tiles.map(tile => tile.slug)).toEqual(["vegetables", "greens"]);
    expect(categories).toHaveLength(3);
  });
  it("uses catalog sorting rather than a fixed JSX section order", () => {
    const categories = [category("vegetables", 20), category("fruits", 10), category("greens", 30)];
    expect(homeCategorySections(categories, products("vegetables", "fruits", "greens")).map(section => section.category.slug)).toEqual(["fruits", "vegetables"]);
  });
  it("does not show empty, inactive, hidden or hidden-parent selections", () => {
    const categories = [category("empty"), category("hidden", 0, { isVisible: false }), category("child", 0, { parentId: "hidden" }),
      category("inactive", 0, { isActive: false }), category("fruit")];
    expect(homeCategorySections(categories, products("hidden", "child", "inactive", "fruit")).map(section => section.category.id)).toEqual(["fruit"]);
  });
  it("uses only populated real descendants and keeps standalone herbs if vegetables are absent", () => {
    const categories = [category("root"), category("child", 10, { parentId: "root" }), category("empty", 20, { parentId: "root" }), category("greens", 30)];
    const result = homeCategorySections(categories, products("child", "greens"));
    expect(result[0].tiles.map(tile => tile.id)).toEqual(["child"]);
    expect(result[1].titleKey).toBeNull();
    expect(translate("tg", "Овощи и зелень")).not.toBe("Овощи и зелень");
  });
  it("prefers an admin upload, restores standard artwork after removal and handles unknown categories", () => {
    expect(categoryArtwork({ slug: "greens", imageUrl: "/api/v1/media/new.webp" }).image).toBe("/api/v1/media/new.webp");
    expect(categoryArtwork({ slug: "greens", imageUrl: null }).image).toBe("/storefront/v2/greens.webp");
    expect(categoryArtwork({ slug: "new-category" }).image).toBe("/brand/icon-v3.png");
  });
  it("localizes every banner field and points at real catalog filters", () => {
    for (const banner of homeBanners) {
      expect(banner.href).toMatch(/^\/catalog\?category=(fruits|greens)$/);
      for (const field of [banner.title, banner.text, banner.action, banner.alt]) expect(translate("tg", field)).not.toBe(field);
    }
  });
  it("links promotions only to visible, nonempty real categories without creating dairy", () => {
    const categories = [category("vegetables"), category("fruits")];
    const banners = homePromotionBanners(categories, products("vegetables", "fruits"));
    expect(banners.map(banner => banner.href)).toEqual(["/catalog?category=vegetables", "/catalog?category=fruits", null]);
    expect(categories).toHaveLength(2);
    for (const banner of banners) for (const field of [banner.title, banner.action, banner.alt, ...(banner.text ? [banner.text] : [])]) {
      expect(translate("tg", field)).not.toBe(field);
    }
  });
  it("does not promote empty or hidden categories and supports populated descendants", () => {
    const categories = [category("vegetables", 0, { isVisible: false }), category("fruits"), category("dairy"), category("milk", 0, { parentId: "dairy" })];
    expect(homePromotionBanners(categories, products("vegetables", "milk")).map(banner => banner.href)).toEqual([null, null, "/catalog?category=dairy"]);
  });
});
