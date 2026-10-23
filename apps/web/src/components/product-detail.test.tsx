import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCartItem, type CartState } from "@/cart/cart";
import type { Product } from "@/lib/api";
import { ProductDetail } from "./product-detail";

const cart = vi.hoisted(() => ({ state: { items: [] } as CartState }));
vi.mock("@/cart/cart-context", () => ({ useCart: () => ({ ...cart, hydrated: true, addProduct: vi.fn(), incrementItem: vi.fn(), decrementItem: vi.fn(), removeItem: vi.fn() }) }));

const product: Product = { id: "tomato", slug: "tomato", name: "Помидоры", description: "Для приготовления блюд.", image: null,
  unit: "kg", sellingPrice: "9.20", isWeighted: true, minQuantity: "0.5", quantityStep: "0.5",
  category: { id: "vegetables", slug: "vegetables", name: "Овощи" }, qualityOptions: [{ id: "ripe", label: "спелые", sortOrder: 0 }] };

describe("product detail without quality selection", () => {
  beforeEach(() => { cart.state = { items: [] }; });
  it("keeps product details, quantity and purchase action but never renders the old choices", () => {
    const html = renderToStaticMarkup(<ProductDetail slug={product.slug} initialProduct={product} />);
    expect(html).toContain("Для приготовления блюд.");
    expect(html).toContain("В корзину");
    expect(html).toContain("Минимальное количество");
    expect(html).not.toContain("спелые");
    expect(html).not.toContain("quality-options");
    expect(html).not.toContain('type="radio"');
  });
  it("places real breadcrumbs and title before media, purchase and actual product facts", () => {
    const html = renderToStaticMarkup(<ProductDetail slug={product.slug} initialProduct={product} />);
    expect(html.indexOf("Хлебные крошки")).toBeLessThan(html.indexOf("<h1>"));
    expect(html.indexOf("<h1>")).toBeLessThan(html.indexOf("product-gallery__media"));
    expect(html).toContain('href="/catalog?category=vegetables"');
    expect(html).toContain("1 кг");
    expect(html).not.toContain("ккал");
    expect(html).not.toContain("Срок годности");
  });
  it("shows thumbnails and an actual discount only when returned in the catalog", () => {
    const html = renderToStaticMarkup(<ProductDetail slug={product.slug} initialProduct={{ ...product,
      images: [1, 2].map(i => ({ url: `/photo-${i}.webp`, sortOrder: i, isPrimary: i === 1 })),
      priceDrop: { oldPrice: "10", discountPercent: 8 } }} />);
    expect(html).toContain("product-gallery__thumbnails");
    expect(html).toContain("product-discount-badge");
    expect(html).toContain("−8%");
    expect(html).toContain("<del");
  });
  it("uses the shared cart counter after adding, without duplicating the add action", () => {
    cart.state.items = [createCartItem({ product, quantity: "1.5", qualityOptionId: null })];
    const html = renderToStaticMarkup(<ProductDetail slug={product.slug} initialProduct={product} />);
    expect(html).toContain("1,5 кг");
    expect(html).toContain("Увеличить количество");
    expect(html).toContain('href="/cart"');
    expect(html).not.toContain("product-purchase-add");
  });
});
