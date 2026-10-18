import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/api";
import { ProductDetail } from "./product-detail";

vi.mock("@/cart/cart-context", () => ({ useCart: () => ({ hydrated: true, addProduct: vi.fn() }) }));

describe("product detail without quality selection", () => {
  it("keeps product details, quantity and purchase action but never renders the old choices", () => {
    const product: Product = { id: "tomato", slug: "tomato", name: "Помидоры", description: "Для приготовления блюд.", image: null,
      unit: "kg", sellingPrice: "9.20", isWeighted: true, minQuantity: "0.5", quantityStep: "0.25",
      category: { id: "vegetables", slug: "vegetables", name: "Овощи" }, qualityOptions: [{ id: "ripe", label: "спелые", sortOrder: 0 }] };
    const html = renderToStaticMarkup(<ProductDetail slug={product.slug} initialProduct={product} />);
    expect(html).toContain("Для приготовления блюд.");
    expect(html).toContain("Увеличить количество");
    expect(html).toContain("Добавить в корзину");
    expect(html).not.toContain("спелые");
    expect(html).not.toContain("quality-options");
    expect(html).not.toContain('type="radio"');
  });
});
