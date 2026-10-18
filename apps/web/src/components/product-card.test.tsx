import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCartItem, type CartState } from "@/cart/cart";
import type { Product } from "@/lib/api";
import { ProductCard } from "./product-card";

const cart = vi.hoisted(() => ({ hydrated: false, state: { items: [] } as CartState }));
vi.mock("@/cart/cart-context", () => ({ useCart: () => ({ ...cart,
  addProduct: vi.fn(), incrementItem: vi.fn(), decrementItem: vi.fn(), removeItem: vi.fn()
}) }));

const product: Product = {
  id: "test", name: "Бананы", slug: "bananas", description: "Свежие бананы", image: null,
  unit: "kg", sellingPrice: "10", isWeighted: true, minQuantity: "0.5", quantityStep: "0.5",
  category: { id: "fruit", name: "Фрукты", slug: "fruit" },
  qualityOptions: [{ id: "ripe", label: "спелые", sortOrder: 0 }]
};

describe("catalog card", () => {
  beforeEach(() => { cart.hydrated = true; cart.state = { items: [] }; });
  it("does not flash an empty-cart action before storage hydration", () => {
    cart.hydrated = false;
    const html = renderToStaticMarkup(<ProductCard product={product} />);
    expect(html).toContain("Загружаем количество в корзине");
    expect(html).not.toContain(">Выбрать</button>");
  });
  it("renders selection as a button, with separate photo and title links", () => {
    const html = renderToStaticMarkup(<ProductCard product={product} />);
    expect(html).toMatch(/<button[^>]*>[\s\S]*Выбрать<\/button>/);
    expect(html).toContain("lucide-plus");
    expect(html).toContain("favorite-button");
    expect(html).toContain("1 кг");
    expect(html.match(/href="\/products\/bananas"/g)).toHaveLength(2);
  });
  it("renders media, price, title, and action without grid descriptions or fake discounts", () => {
    const html = renderToStaticMarkup(<ProductCard product={product} />);
    expect(html).not.toContain("Свежие бананы");
    expect(html).not.toContain("Стало дешевле");
    expect(html.indexOf("product-price")).toBeLessThan(html.indexOf("<h3"));
    expect(html).not.toContain("product-gallery__dots");
  });
  it("uses an accessible plus action for an ordinary product", () => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...product, qualityOptions: [] }} />);
    expect(html).toContain('aria-label="Добавить в корзину: Бананы"');
    expect(html).not.toContain('product-card__action--options');
  });
  it("renders three-photo controls and only a backend-confirmed price drop", () => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...product, images: [1, 2, 3].map(i => ({ url: `/photo-${i}`, sortOrder: i, isPrimary: i === 1 })),
      priceDrop: { oldPrice: "12", discountPercent: 17 } }} />);
    expect(html).toContain("product-gallery__dots"); expect(html).toContain("Стало дешевле");
    expect(html).toContain("−17%"); expect(html).toContain("<del");
    expect(html.indexOf("product-price__current")).toBeLessThan(html.indexOf("product-price__meta"));
    expect(html.indexOf("product-price__meta")).toBeLessThan(html.indexOf("<h3"));
  });
  it("renders the saved quantity and quality instead of selection", () => {
    cart.state.items = [createCartItem({ product, quantity: "2.5", qualityOptionId: "ripe" })];
    const html = renderToStaticMarkup(<ProductCard product={product} />);
    expect(html).toContain("2,5 кг");
    expect(html).toContain("спелые");
    expect(html).toContain("Уменьшить количество: Бананы, спелые");
    expect(html).not.toContain(">Выбрать</button>");
  });
  it.each([true, undefined])("shows the compact availability badge for a public product (%s)", isAvailableToday => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...product, isAvailableToday }} />);
    expect(html).toContain('class="availability-badge"');
    expect(html).toContain("Сегодня в наличии");
  });
  it.each([{ isAvailableToday: false }, { isActive: false }])("does not advertise unavailable products: %j", flags => {
    expect(renderToStaticMarkup(<ProductCard product={{ ...product, ...flags }} />)).not.toContain("availability-badge");
  });
});
