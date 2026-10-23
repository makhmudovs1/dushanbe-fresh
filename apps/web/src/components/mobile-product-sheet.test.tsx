import { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCartItem, type CartState } from "@/cart/cart";
import type { Product } from "@/lib/api";
import { MobileProductSheet, MobileProductSheetCart, isProductSheetDismissal } from "./mobile-product-sheet";
import { shouldOpenMobileProductSheet } from "./mobile-product-sheet-provider";
import { ProductPurchaseActions } from "./product-purchase-actions";

const cart = vi.hoisted(() => ({ hydrated: true, state: { items: [] } as CartState,
  addProduct: vi.fn(), incrementItem: vi.fn(), decrementItem: vi.fn(), removeItem: vi.fn() }));
vi.mock("@/cart/cart-context", () => ({ useCart: () => cart }));
vi.mock("@/i18n/provider", () => ({ useI18n: () => ({ t: (text: string) => text,
  name: (value: { name: string }) => value.name, description: (value: Product) => value.description,
  priceLabel: (price: string, unit: string) => `${price}/${unit}`, locale: "ru",
  quantityLabel: (quantity: string, unit: string) => `${quantity} ${unit}`, unitLabel: () => "кг" }) }));

const product: Product = { id: "banana", slug: "banana", name: "Бананы", description: "Свежие бананы", image: null,
  unit: "kg", sellingPrice: "10", isWeighted: true, minQuantity: "0.5", quantityStep: "0.5",
  category: { id: "fruit", name: "Фрукты", slug: "fruit" },
  qualityOptions: [{ id: "ripe", label: "спелые", sortOrder: 0 }] };

type ControlProps = { onClick: () => void; onIncrease: () => void; onDecrease: () => void; quantity: string; disabled: boolean };
function control(ready = true) {
  return (ProductPurchaseActions({ product, ready }) as ReactElement<ControlProps>).props;
}

describe("mobile product links", () => {
  const click = { defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  it("only intercepts ordinary mobile clicks", () => {
    expect(shouldOpenMobileProductSheet(click, true)).toBe(true);
    expect(shouldOpenMobileProductSheet(click, false)).toBe(false);
    expect(shouldOpenMobileProductSheet({ ...click, button: 1 }, true)).toBe(false);
  });
  it.each(["metaKey", "ctrlKey", "shiftKey", "altKey", "defaultPrevented"] as const)("preserves %s navigation and gallery swipe suppression", key => {
    expect(shouldOpenMobileProductSheet({ ...click, [key]: true }, true)).toBe(false);
  });
});

describe("handle dismissal", () => {
  it.each([[0, 72, true], [20, 100, true], [0, 71, false], [0, -100, false], [100, 80, false]])(
    "evaluates displacement %s, %s", (dx, dy, expected) => {
      expect(isProductSheetDismissal(dx as number, dy as number)).toBe(expected);
    });
});

describe("mobile product sheet", () => {
  beforeEach(() => { cart.hydrated = true; cart.state.items = []; vi.clearAllMocks(); });

  it("renders actual details, a named dialog, and the direct route while revalidating", () => {
    const html = renderToStaticMarkup(<MobileProductSheet initialProduct={product} onClose={vi.fn()} />);
    expect(html).toContain("<dialog");
    expect(html).toContain("aria-labelledby=");
    expect(html).toContain("Свежие бананы");
    expect(html).toContain("Загружаем карточку товара");
    expect(html).not.toContain("Открыть страницу товара");
    expect(html).toContain("Поделиться товаром");
    expect(html).not.toContain("спелые");
    expect(html).not.toContain('type="radio"');
  });

  it("adds the catalog minimum with null quality, even when options exist", () => {
    control().onClick();
    expect(cart.addProduct).toHaveBeenCalledWith({ product, quantity: "0.5", qualityOptionId: null });
  });

  it("disables purchases until fresh detail data is ready", () => {
    expect(control(false).disabled).toBe(true);
    expect(control().disabled).toBe(false);
  });

  it("waits for cart hydration", () => {
    cart.hydrated = false;
    const html = renderToStaticMarkup(<MobileProductSheetCart product={product} ready />);
    expect(html).toContain("Загружаем количество в корзине");
    expect(html).not.toContain("Добавить в корзину");
  });

  it.each([{ isActive: false }, { isAvailableToday: false }])("blocks unavailable products: %j", flags => {
    const html = renderToStaticMarkup(<MobileProductSheetCart product={{ ...product, ...flags }} ready />);
    expect(html).toContain("Товар больше недоступен.");
    expect(html).not.toContain("Добавить в корзину");
  });

  it("requires explicit resolution of legacy lines instead of adjusting a random line", () => {
    const legacy = createCartItem({ product, quantity: "1.5", qualityOptionId: "ripe" });
    const current = createCartItem({ product, quantity: "0.5", qualityOptionId: null });
    cart.state.items = [legacy, current];
    const html = renderToStaticMarkup(<MobileProductSheetCart product={product} ready />);
    expect(html).toContain("Уточнить корзину");
    expect(html).not.toContain("<output");
    expect(cart.incrementItem).not.toHaveBeenCalled();
    expect(cart.removeItem).not.toHaveBeenCalled();
    expect(cart.state.items[0].qualityOptionId).toBe("ripe");
    expect(cart.addProduct).not.toHaveBeenCalled();
  });

  it("does not offer quantity edits for a sole legacy line", () => {
    const legacy = createCartItem({ product, quantity: "1.5", qualityOptionId: "ripe" });
    cart.state.items = [legacy];
    expect(renderToStaticMarkup(<MobileProductSheetCart product={product} ready />)).toContain('href="/cart"');
    expect(cart.decrementItem).not.toHaveBeenCalled();
    expect(cart.addProduct).not.toHaveBeenCalled();
  });
});
