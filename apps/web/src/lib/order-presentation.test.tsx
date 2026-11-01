import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Product } from "./api";
import { minimumProgress, orderDate, orderPhoto } from "./order-presentation";
import { MinimumOrderProgress } from "@/components/cart-pricing";
import type { CheckoutQuote } from "@dushanbe-fresh/shared";

describe("order presentation without invented business values", () => {
  it("uses the server shortfall, including zero minimums and bounded progress", () => {
    expect(minimumProgress("40.00", "15.00")).toBe(62.5);
    expect(minimumProgress("40.00", "0.00")).toBe(100);
    expect(minimumProgress("0.00", "0.00")).toBe(100);
    expect(minimumProgress("40.00", "50.00")).toBe(0);
    expect(minimumProgress("unknown", "1")).toBeNull();
  });
  it("keeps minimum order distinct from a free delivery offer", () => {
    const quote = { minimumOrderAmount: "40.00", minimumOrderShortfall: "15.00" } as CheckoutQuote;
    const html = renderToStaticMarkup(<MinimumOrderProgress quote={quote} />);
    expect(html).toContain('value="62.5"');
    expect(html).toContain("15 сомони");
    expect(html).not.toContain("бесплатной доставки");
    expect(renderToStaticMarkup(<MinimumOrderProgress quote={{ ...quote, minimumOrderShortfall: "0.00" }} />)).toContain("Минимальный заказ набран");
  });
  it("uses Dushanbe dates rather than the browser timezone", () => {
    expect(orderDate("2026-10-31T21:15:00Z", "ru")).toContain("1 ноября");
    expect(orderDate("2026-10-31T21:15:00Z", "ru")).toContain("02:15");
    expect(orderDate("invalid", "ru")).toBe("");
    expect(orderDate("2026-10-31T21:15:00Z", "tg")).not.toContain("ноября");
  });
  it("never substitutes another variety or uses an ambiguous photo", () => {
    const products = [{ name: "Картофель белый", image: "/white.webp" }, { name: "Картофель красный", image: "/red.webp" }] as Product[];
    const item = { name: "Картофель белый", quantity: "1", unit: "kg", total: "7" };
    expect(orderPhoto(item, products)).toBe("/white.webp");
    expect(orderPhoto({ ...item, name: "Картофель" }, products)).toBeNull();
    expect(orderPhoto(item, [...products, { ...products[0], image: "/other.webp" }])).toBeNull();
  });
});
