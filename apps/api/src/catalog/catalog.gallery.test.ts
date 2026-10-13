import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { parseGallery } from "./catalog.gallery";
import { mapPublicProduct } from "./catalog.mappers";
import type { ProductWithCategoryAndOptions } from "./catalog.types";

const urls = [1, 2, 3].map(i => `/api/v1/media/00000000-0000-4000-8000-00000000000${i}.webp`);
const product = {
  id: "test", name: "Товар", slug: "test", imageUrl: urls[0], currentSalePrice: new Prisma.Decimal("9.2"),
  currentPurchasePrice: new Prisma.Decimal("8"), minQuantity: new Prisma.Decimal("0.5"), quantityStep: new Prisma.Decimal("0.25"),
  category: { id: "cat", name: "Овощи", slug: "vegetables" }, qualityOptions: []
} as unknown as ProductWithCategoryAndOptions;

describe("gallery and sale-price mapping", () => {
  it("orders images with the primary first and preserves the legacy fallback", () => {
    const input = parseGallery(urls.map((url, index) => ({ url, sortOrder: 2 - index, isPrimary: index === 1 })));
    const mapped = mapPublicProduct({ ...product, images: input.map((image, i) => ({ ...image, id: String(i) })) as never });
    expect(mapped.images.map(image => image.url)).toEqual([urls[1], urls[2], urls[0]]);
    expect(mapped.image).toBe(urls[1]);
    expect(mapPublicProduct(product).image).toBe(urls[0]);
    expect(mapPublicProduct({ ...product, imageUrl: null }).image).toBeNull();
  });
  it("selects the next cover when the primary is removed", () => {
    expect(parseGallery([{ url: urls[1] }, { url: urls[2] }]).map(image => image.isPrimary)).toEqual([true, false]);
  });
  it.each([[{ url: urls[0] }, { url: urls[0] }], [{ url: "data:image/png;base64,test" }], urls.map(url => ({ url, isPrimary: true })), Array(13).fill({ url: urls[0] })])("rejects invalid galleries", input => {
    expect(() => parseGallery(input)).toThrow();
  });
  it.each([
    ["10.5", "9.2", { oldPrice: "10.5", discountPercent: 12 }],
    ["10", "12", null], ["10", "10", null], ["0", "0", null], ["10", "9.999", null]
  ])("uses only a matching latest sale change %s → %s", (old, next, expected) => {
    const dto = mapPublicProduct({ ...product,
      currentSalePrice: new Prisma.Decimal(next === "9.999" ? "9.2" : next as string),
      priceHistory: [{ oldSalePrice: new Prisma.Decimal(old as string), newSalePrice: new Prisma.Decimal(next as string) }] as never
    });
    expect(dto.priceDrop).toEqual(expected);
    expect(dto).not.toHaveProperty("purchasePrice");
  });
  it("never fabricates discounts without history", () => {
    expect(mapPublicProduct(product).priceDrop).toBeNull();
  });
});
