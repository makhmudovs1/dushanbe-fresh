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
    expect(html).toMatch(/<button[^>]*>Выбрать<\/button>/);
    expect(html.match(/href="\/products\/bananas"/g)).toHaveLength(2);
  });
  it("renders the saved quantity and quality instead of selection", () => {
    cart.state.items = [createCartItem({ product, quantity: "2.5", qualityOptionId: "ripe" })];
    const html = renderToStaticMarkup(<ProductCard product={product} />);
    expect(html).toContain("2,5 кг");
    expect(html).toContain("спелые");
    expect(html).toContain("Уменьшить количество: Бананы, спелые");
    expect(html).not.toContain(">Выбрать</button>");
  });
});
