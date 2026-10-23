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
    expect(html).toContain('aria-label="Добавить в корзину: Бананы"');
    expect(html).toContain("lucide-plus");
    expect(html).toContain("favorite-button");
    expect(html).toContain("1 кг");
    expect(html.match(/href="\/products\/bananas"/g)).toHaveLength(2);
    expect(html).not.toContain("product-card__action--options");
    expect(html).not.toContain("catalog-quality");
    expect(html.indexOf('class="product-card__action"')).toBeLessThan(html.indexOf('class="product-card__body"'));
  });
  it("renders media, price, title, and action without grid descriptions or fake discounts", () => {
    const html = renderToStaticMarkup(<ProductCard product={product} />);
    expect(html).not.toContain("Свежие бананы");
    expect(html).not.toContain("Стало дешевле");
    expect(html.indexOf("product-price")).toBeLessThan(html.indexOf("<h3"));
    expect(html).not.toContain("product-gallery__dots");
  });
  it("can omit unused favorite controls in compact mobile recommendations without changing purchase actions", () => {
    const html = renderToStaticMarkup(<ProductCard product={product} showFavorite={false} />);
    expect(html).not.toContain("favorite-button");
    expect(html).toContain('aria-label="Добавить в корзину: Бананы"');
    expect(html.match(/href="\/products\/bananas"/g)).toHaveLength(2);
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
  it("renders the saved quantity without exposing a quality chooser", () => {
    cart.state.items = [createCartItem({ product, quantity: "2.5" })];
    const html = renderToStaticMarkup(<ProductCard product={product} />);
    expect(html).toContain("2,5 кг");
    expect(html).not.toContain("спелые");
    expect(html).toContain("Уменьшить количество: Бананы");
    expect(html).not.toContain(">Выбрать</button>");
  });
  it("links legacy conflicts to the cart without a summed or editable counter", () => {
    cart.state.items = [createCartItem({ product, quantity: "1.5", qualityOptionId: "ripe" }), createCartItem({ product, quantity: "0.5", qualityOptionId: null })];
    const html = renderToStaticMarkup(<ProductCard product={product} />);
    expect(html).toContain("Уточнить старые позиции в корзине");
    expect(html).toContain('href="/cart"');
    expect(html).not.toContain("<output");
    expect(html).not.toContain("Увеличить количество");
    expect(cart.state.items.map(item => item.qualityOptionId)).toEqual(["ripe", null]);
  });
  it.each([true, undefined])("does not repeat availability on a public card (%s)", isAvailableToday => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...product, isAvailableToday }} />);
    expect(html).not.toContain('class="availability-badge"');
    expect(html).not.toContain("Сегодня в наличии");
  });
  it.each([{ isAvailableToday: false }, { isActive: false }])("does not advertise unavailable products: %j", flags => {
    expect(renderToStaticMarkup(<ProductCard product={{ ...product, ...flags }} />)).not.toContain("availability-badge");
  });
});
