import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCartItem, type CartState } from "@/cart/cart";
import { useI18n } from "@/i18n/provider";
import { decimalLabel, quantityLabel } from "@/lib/format";
import type { Product } from "@/lib/api";
import { cartShareText, shareCartText } from "./cart-mobile-header";
import { CartPageContent, selectCartRecommendations } from "./cart-page-content";

const cart = vi.hoisted(() => ({ hydrated: true, state: { items: [] } as CartState }));
vi.mock("@/cart/cart-context", () => ({ useCart: () => ({ ...cart, lineCount: cart.state.items.length,
  clearCart: vi.fn(), incrementItem: vi.fn(), decrementItem: vi.fn(), removeItem: vi.fn()
}) }));

const product: Product = {
  id: "bananas", name: "Бананы", slug: "bananas", description: null, image: null,
  unit: "kg", sellingPrice: "10.50", isWeighted: true, minQuantity: "0.5", quantityStep: "0.5",
  category: { id: "fruit", name: "Фрукты", slug: "fruit" },
  qualityOptions: [{ id: "ripe", label: "спелые", sortOrder: 0 }]
};
const labels: Pick<ReturnType<typeof useI18n>, "t" | "name" | "label" | "quantityLabel"> = {
  t: value => value, name: value => value.name, label: value => value.label, quantityLabel
};

describe("cart enhancements", () => {
  beforeEach(() => { cart.hydrated = true; cart.state = { items: [] }; });

  it("keeps mobile cart heading and search during hydration and for an empty cart", () => {
    for (const hydrated of [false, true]) {
      cart.hydrated = hydrated;
      const html = renderToStaticMarkup(<CartPageContent />);
      expect(html).toContain("<h1>Корзина</h1>");
      expect(html).toContain('href="/catalog?focusSearch=1"');
      expect(html).toMatch(/disabled="" aria-label="Поделиться корзиной"/);
      expect(html).toMatch(/disabled="" aria-label="Очистить корзину"/);
      expect(html).not.toContain("Подобрали для вас");
    }
  });

  it("retains checkout and weighted totals", () => {
    cart.state.items = [createCartItem({ product, quantity: "1.5" })];
    const html = renderToStaticMarkup(<CartPageContent />);
    expect(html).toContain('href="/checkout"');
    expect(html).toContain("≈ 15,75");
    expect(html).not.toContain("Качество:");
    expect(html).not.toMatch(/disabled="" aria-label="Очистить корзину"/);
    expect(cart.state.items[0].quantity).toBe("1.5");
  });

  it("shares actual quantities, quality variants and exact existing monetary calculations, without a link", () => {
    const state = { items: [createCartItem({ product, quantity: "1.5", qualityOptionId: "ripe" }),
      createCartItem({ product, quantity: "0.5", qualityOptionId: null })] };
    const text = cartShareText(state, labels);
    expect(text).toBe("Dushanbe Fresh - Корзина\nБананы (спелые): 1,5 кг - ≈ 15,75 сомони\nБананы: 0,5 кг - ≈ 5,25 сомони\nПредварительно: ≈ 21 сомони\nДоставка: будет рассчитана позже");
    expect(text).not.toMatch(/https?:|\/cart/);
  });

  it("uses localized names, quality and quantities and does not approximate unweighted items", () => {
    const item = createCartItem({ product: { ...product, nameTj: "Банан", isWeighted: false, unit: "piece",
      qualityOptions: [{ id: "ripe", label: "спелые", labelTj: "пухта", sortOrder: 0 }] }, quantity: "2", qualityOptionId: "ripe" });
    const text = cartShareText({ items: [item] }, { ...labels,
      name: value => value.nameTj || value.name, label: value => value.labelTj || value.label,
      quantityLabel: (quantity, unit) => quantityLabel(quantity, unit, "tg") });
    expect(text).toContain(`Банан (пухта): ${decimalLabel("2")} дона - 21 сомони`);
    expect(text).not.toContain("≈");
  });

  it("excludes every cart product ID, omits unavailable products and caps real recommendations at twelve", () => {
    const products = Array.from({ length: 18 }, (_, i) => ({ ...product, id: String(i) }));
    products[0].isActive = false;
    products[1].isAvailableToday = false;
    expect(selectCartRecommendations(products, new Set(["2"])).map(p => p.id)).toEqual(Array.from({ length: 12 }, (_, i) => String(i + 3)));
    expect(selectCartRecommendations(products, new Set(products.map(p => p.id)))).toEqual([]);
    expect(selectCartRecommendations([], new Set())).toEqual([]);
  });
});

describe("native cart sharing and clipboard fallback", () => {
  function browser(share?: Navigator["share"]) {
    return { share, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } } as unknown as Pick<Navigator, "share" | "clipboard">;
  }
  it("shares text, never a fabricated URL", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const nav = browser(share);
    await expect(shareCartText("actual cart", "Корзина", nav)).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: "Корзина", text: "actual cart" });
    expect(nav.clipboard.writeText).not.toHaveBeenCalled();
  });
  it("copies when native share is unavailable", async () => {
    const nav = browser();
    await expect(shareCartText("actual cart", "Корзина", nav)).resolves.toBe("copied");
    expect(nav.clipboard.writeText).toHaveBeenCalledWith("actual cart");
  });
  it("falls back after a share failure but respects cancellation", async () => {
    const nav = browser(vi.fn().mockRejectedValue(new Error("Unavailable")));
    await expect(shareCartText("actual cart", "Корзина", nav)).resolves.toBe("copied");
    const cancelled = browser(vi.fn().mockRejectedValue({ name: "AbortError" }));
    await expect(shareCartText("actual cart", "Корзина", cancelled)).resolves.toBe("cancelled");
    expect(cancelled.clipboard.writeText).not.toHaveBeenCalled();
  });
  it("reports clipboard failure instead of claiming success", async () => {
    const nav = browser();
    vi.mocked(nav.clipboard.writeText).mockRejectedValue(new Error("Denied"));
    await expect(shareCartText("actual cart", "Корзина", nav)).rejects.toThrow("Denied");
  });
});
