import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/api";
import { ProductInformation } from "./product-information";

const language = vi.hoisted(() => ({ locale: "ru" }));
vi.mock("@/i18n/provider", () => ({ useI18n: () => ({ locale: language.locale, t: (s: string) => s,
  name: (p: { name: string }) => p.name, description: (p: Product) => p.description,
  quantityLabel: (q: string, u: string) => `${q} ${u}` }) }));
const product = { slug: "potatoes", description: "Свежий картофель", unit: "kg", category: { name: "Овощи" }, minQuantity: "0.5", quantityStep: "0.5" } as Product;

describe("shared desktop/mobile product information", () => {
  it("renders sourced nutrition, editable-weight basis, storage and no invented expiry date", () => {
    language.locale = "ru";
    const html = renderToStaticMarkup(<ProductInformation product={product} />);
    expect(html).toContain("Пищевая ценность"); expect(html).toContain("На 100 г"); expect(html).toContain("На 1 кг");
    expect(html).toContain(">77</strong>"); expect(html).toContain("2–4 недели");
    expect(html).toContain("Точный срок годности партии"); expect(html).toContain("USDA FoodData Central");
    expect(html).not.toContain("Годен до");
  });
  it("does not assume a bunch weighs 1kg or fabricate unknown-product facts", () => {
    language.locale = "ru";
    expect(renderToStaticMarkup(<ProductInformation product={{ ...product, slug: "basil", unit: "bunch" }} />)).not.toContain("На 1 кг");
    const html = renderToStaticMarkup(<ProductInformation product={{ ...product, slug: "unknown-product" }} />);
    expect(html).not.toContain("Пищевая ценность"); expect(html).toContain("По маркировке или данным поставщика.");
  });
  it("localizes all new labels and storage in Tajik", () => {
    language.locale = "tg";
    const html = renderToStaticMarkup(<ProductInformation product={product} />);
    for (const label of ["Арзиши ғизоӣ", "Ба 100 г", "сафедаҳо", "равғанҳо", "карбогидратҳо", "Муҳлат ва шароити нигоҳдорӣ", "ҷои салқин"]) expect(html).toContain(label);
    language.locale = "ru";
  });
});
