import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomePromotions } from "./home-promotions";

describe("home promotion layout", () => {
  it("renders three supplied images, HTML headings, honest availability and three benefits", () => {
    const html = renderToStaticMarkup(<HomePromotions categories={[
      { id: "veg", slug: "vegetables", name: "Овощи", sortOrder: 10 },
      { id: "fruit", slug: "fruits", name: "Фрукты", sortOrder: 20 }
    ]} products={[{ category: { id: "veg", slug: "vegetables", name: "Овощи" } }, { category: { id: "fruit", slug: "fruits", name: "Фрукты" } } ]} />);
    expect(html).toContain("<h1>Овощи и зелень</h1>");
    for (const file of ["vegetables", "fruits", "dairy"]) expect(html).toContain(encodeURIComponent(`/storefront/home/${file}.webp`));
    expect(html).toContain("Скоро в магазине");
    expect(html).not.toContain("category=dairy");
    expect(html.match(/<li>/g)).toHaveLength(3);
    expect(html).toContain("Доставка по Душанбе");
    expect(html).toContain("Бережная сборка заказа");
  });
});
