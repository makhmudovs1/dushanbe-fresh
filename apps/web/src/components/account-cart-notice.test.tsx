import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CartLegacyConflict } from "@/cart/account-cart";
import { AccountCartNotice } from "./account-cart-notice";

const cart = vi.hoisted(() => ({ hydrated: true, syncError: "", legacyConflicts: [] as CartLegacyConflict[], retrySync: vi.fn(), discardIncoming: vi.fn(), removeBoth: vi.fn() }));
vi.mock("@/cart/cart-context", () => ({ useCart: () => cart }));
const savedLine = { productId: "potato", slug: "potato", name: "Картофель", imageUrl: null, unit: "kg", isWeighted: true, sellingPrice: "7", quantity: "1", minQuantity: "0.5", quantityStep: "0.5", qualityOptionId: "old", qualityOptionLabel: "Старое предпочтение" };
describe("account cart recovery notice", () => {
  beforeEach(() => { cart.legacyConflicts = []; cart.syncError = "Не удалось синхронизировать корзину. Локальные изменения сохранены; повторите попытку."; });
  it("renders a retry even when the visible cart has no items", () => {
    const html = renderToStaticMarkup(<AccountCartNotice />);
    expect(html).toContain("Повторить");
    expect(html).toContain('role="alert"');
  });
  it("shows both exact quantities and preferences rather than a merged counter", () => {
    const saved = savedLine;
    cart.legacyConflicts = [{ key: "pair", saved, incoming: { ...saved, quantity: "2", qualityOptionLabel: "Другое старое предпочтение" } }];
    const html = renderToStaticMarkup(<AccountCartNotice />);
    expect(html).toContain("1 кг");
    expect(html).toContain("2 кг");
    expect(html).not.toContain("3 кг");
    expect(html).toContain("Старое предпочтение");
    expect(html).toContain("Другое старое предпочтение");
    expect(html).toContain("Оставить позицию аккаунта");
    expect(html).toContain("Удалить обе позиции");
    expect(html).not.toContain(">Повторить<");
    expect(cart.discardIncoming).not.toHaveBeenCalled();
    expect(cart.removeBoth).not.toHaveBeenCalled();
  });
  it("does not describe a Tajik-only historical preference as an ordinary product", () => {
    const line = { ...savedLine, qualityOptionLabel: null, qualityOptionLabelTj: "Интихоби пешина" };
    cart.legacyConflicts = [{ key: "pair", saved: line, incoming: { ...line, quantity: "2" } }];
    const html = renderToStaticMarkup(<AccountCartNotice />);
    expect(html).toContain("Интихоби пешина");
    expect(html).not.toContain("Без предпочтения");
  });
});
