import { describe, expect, it } from "vitest";
import { categoryArtwork, featuredCategories, homeBanners } from "./storefront";
import { translate } from "@/i18n/locale";

describe("storefront configuration", () => {
  it("uses admin sorting first and assortment size for ties, including descendants", () => {
    const categories = [
      { id: "small", slug: "small", name: "Small", sortOrder: 0 },
      { id: "large", slug: "large", name: "Large", sortOrder: 0 },
      { id: "child", parentId: "large", slug: "child", name: "Child", sortOrder: 0 },
      { id: "priority", slug: "priority", name: "Priority", sortOrder: -1 }
    ];
    const products = ["small", "child", "child"].map(id => ({ category: { id, slug: id, name: id } }));
    expect(featuredCategories(categories, products).map(category => category.id)).toEqual(["priority", "large", "small"]);
    expect(categories[0].id).toBe("small");
  });
  it("limits featured roots to four without creating categories", () => {
    const categories = Array.from({ length: 5 }, (_, id) => ({ id: String(id), name: String(id), slug: String(id), sortOrder: id }));
    expect(featuredCategories(categories, []).map(category => category.id)).toEqual(["0", "1", "2", "3"]);
  });
  it("prefers an admin upload, restores standard artwork after removal and handles unknown categories", () => {
    expect(categoryArtwork({ slug: "greens", imageUrl: "/api/v1/media/new.webp" }).image).toBe("/api/v1/media/new.webp");
    expect(categoryArtwork({ slug: "greens", imageUrl: null }).image).toBe("/storefront/v2/greens.webp");
    expect(categoryArtwork({ slug: "new-category" }).image).toBe("/brand/icon-v2.png");
  });
  it("localizes every banner field and points at real catalog filters", () => {
    for (const banner of homeBanners) {
      expect(banner.href).toMatch(/^\/catalog\?category=(fruits|greens)$/);
      for (const field of [banner.title, banner.text, banner.action, banner.alt]) expect(translate("tg", field)).not.toBe(field);
    }
  });
});
