import { describe, expect, it } from "vitest";
import { catalogLayout } from "./catalog-layout";
describe("compact catalog geometry", () => {
  it.each([320, 360, 390, 430, 768])(
    "fits width %i with no horizontal overflow across system font sizes",
    (width) => {
      for (const scale of [1, 1.3, 1.6, 2, 3]) {
        const { columns, cardWidth } = catalogLayout(width, scale);
        expect(columns).toBeGreaterThanOrEqual(1);
        expect(columns).toBeLessThanOrEqual(3);
        expect(cardWidth).toBeGreaterThan(0);
        expect(cardWidth * columns + 10 * (columns - 1) + 32).toBeCloseTo(
          width,
        );
      }
    },
  );
  it("preserves two columns on a compact standard screen and uses one for large text", () => {
    expect(catalogLayout(320, 1).columns).toBe(2);
    expect(catalogLayout(320, 1.6).columns).toBe(1);
    expect(catalogLayout(390, 2).columns).toBe(1);
  });
});
