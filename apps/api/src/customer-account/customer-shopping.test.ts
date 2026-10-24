import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomerShoppingController } from "./customer-shopping.controller";
import { assertCartBound, CartLine, cartKey, mergeCartItems, parseCartImport, parseCartItems, parseCartWrite } from "./customer-shopping.validation";
import { parseAddress, parseSavedAddress } from "./customer-address.validation";
import { CustomerAccountService } from "./customer-account.service";
import { CustomerShoppingService } from "./customer-shopping.service";

export const line = (overrides: Partial<CartLine> = {}): CartLine => ({
  productId: "product", slug: "product", name: "Saved product", nameTj: null, imageUrl: null,
  unit: "kg", sellingPrice: "12.50", isWeighted: true, quantity: "0.75", minQuantity: "0.5", quantityStep: "0.25",
  qualityOptionId: null, qualityOptionLabel: null, qualityOptionLabelTj: null, ...overrides
});

afterEach(() => { vi.unstubAllEnvs(); });

describe("shopping validation and merge", () => {
  it("preserves decimal strings and complete legacy snapshots without normalizing", () => {
    const item = line({ qualityOptionId: "old", qualityOptionLabel: "Old preference", qualityOptionLabelTj: "Old TJ", quantity: "00.751", minQuantity: "2", quantityStep: "0.5" });
    expect(parseCartItems([item])).toEqual([item]);
    expect(parseCartItems([line({ status: "unavailable" })])[0]).not.toHaveProperty("status");
  });
  it("merges by the pair of identities using max quantity, retaining saved metadata and observed price", () => {
    const old = line({ qualityOptionId: "old", qualityOptionLabel: "Legacy", quantity: "2" });
    const items = mergeCartItems({ revision: 4, items: [line(), old] }, [line({ quantity: "1", sellingPrice: "99" }), old]);
    expect(items).toEqual([line({ quantity: "1" }), old]);
    expect(cartKey(line({ productId: "a:b", qualityOptionId: "c" }))).not.toEqual(cartKey(line({ productId: "a", qualityOptionId: "b:c" })));
  });
  it("never changes a saved legacy line on import, including higher quantities and label-only preferences", () => {
    for (const legacy of [line({ qualityOptionId: "old", qualityOptionLabel: "Historical" }), line({ qualityOptionLabel: "Historical" }), line({ qualityOptionLabelTj: "Historical TJ" })]) {
      const changed = { ...legacy, quantity: "99", name: "Changed", sellingPrice: "999", qualityOptionLabel: null, qualityOptionLabelTj: null };
      expect(() => mergeCartItems({ revision: 4, items: [legacy] }, [changed])).toThrow("В корзинах есть несовместимые старые позиции.");
      const identical = Object.fromEntries(Object.entries(legacy).reverse()) as CartLine;
      const merged = mergeCartItems({ revision: 4, items: [legacy] }, [identical]);
      expect(merged).toEqual([legacy]);
      expect(merged[0]).toBe(legacy);
    }
    const guestLegacy = line({ productId: "unknown", qualityOptionId: "orphaned", qualityOptionLabel: "Guest snapshot", quantity: "0.751" });
    expect(mergeCartItems({ revision: 0, items: [] }, [guestLegacy])).toEqual([guestLegacy]);
  });
  it("does not silently turn an incoming label-only legacy snapshot into an ordinary line", () => {
    const legacy = line({ qualityOptionLabel: "Historical preference", quantity: "0.751", sellingPrice: "2.00" });
    expect(() => mergeCartItems({ revision: 4, items: [line({ quantity: "90" })] }, [legacy])).toThrow("В корзинах есть несовместимые старые позиции.");
  });
  it("requires explicit review for different preference labels even with the same quality ID and quantity", () => {
    for (const qualityOptionId of [null, "same-id"]) {
      const saved = line({ qualityOptionId, qualityOptionLabel: "Preference A", quantity: "90" });
      const incoming = line({ qualityOptionId, qualityOptionLabel: "Preference B", quantity: "1" });
      expect(() => mergeCartItems({ revision: 4, items: [saved] }, [incoming])).toThrow("В корзинах есть несовместимые старые позиции.");
    }
  });
  it("rejects forged ownership, extra fields, duplicate keys, invalid revisions and non-UUID sources", () => {
    for (const value of [{ revision: -1, items: [] }, { revision: 1.5, items: [] }, { revision: 2147483647, items: [] }, { revision: 0, items: [], userId: "victim" }]) expect(() => parseCartWrite(value)).toThrow();
    expect(() => parseCartImport({ sourceId: "not-a-uuid", items: [] })).toThrow();
    const sourceId = randomUUID();
    expect(parseCartImport({ sourceId: sourceId.toUpperCase(), items: [] })).toEqual({ sourceId, items: [] });
    expect(() => parseCartItems([line(), line()])).toThrow();
    expect(() => parseCartItems([{ ...line(), userId: "victim" }])).toThrow();
  });
  it("bounds quantities, prices, text, links, booleans and total JSON without truncation", () => {
    for (const quantity of ["0", "-1", "NaN", "1e3", "1000000", "1.0001", " 1", 1]) expect(() => parseCartItems([{ ...line(), quantity }])).toThrow();
    for (const sellingPrice of ["-1", "Infinity", "10000000000", "1.001", 12]) expect(() => parseCartItems([{ ...line(), sellingPrice }])).toThrow();
    for (const item of [line({ name: "x".repeat(501) }), line({ imageUrl: "javascript:alert(1)" }), line({ imageUrl: "//evil.test/x" }), line({ imageUrl: "/\\evil.test/x" }), line({ slug: "https://evil.test" }), { ...line(), isWeighted: "true" }, line({ qualityOptionLabel: "\u0000" })]) expect(() => parseCartItems([item])).toThrow();
    expect(() => parseCartItems(Array.from({ length: 101 }, (_, i) => line({ productId: String(i) })))).toThrow();
    expect(() => assertCartBound([line({ name: "x".repeat(240001) })])).toThrow();
    expect(() => mergeCartItems({ revision: 4, items: Array.from({ length: 100 }, (_, i) => line({ productId: String(i) })) }, [line({ productId: "new" })])).toThrow();
  });
  it("returns stable Russian dictionary keys for malformed data and cart limits", () => {
    expect(() => parseCartWrite({ revision: -1, items: [] })).toThrow("Проверьте данные корзины или избранного.");
    expect(() => parseCartItems(Array.from({ length: 101 }, (_, i) => line({ productId: String(i) })))).toThrow("В корзине может быть не больше 100 позиций.");
    expect(() => assertCartBound([line({ name: "x".repeat(240001) })])).toThrow("Корзина слишком большая. Удалите часть товаров и попробуйте снова.");
  });
});

describe("shopping controller security", () => {
  it("requires exact origin and a verified session for every mutation", async () => {
    vi.stubEnv("WEB_ORIGIN", "http://localhost:3000");
    const session = vi.fn().mockRejectedValue(new Error("unauthorized"));
    const shopping = { setFavorite: vi.fn(), replaceCart: vi.fn(), importCart: vi.fn() };
    const controller = new CustomerShoppingController({ session } as never, shopping as never);
    for (const origin of [undefined, "null", "https://evil.test", "http://localhost:3000.evil.test"]) {
      await expect(controller.favorite("product", { active: true }, "cookie", origin)).rejects.toThrow();
      await expect(controller.replace({ revision: 0, items: [] }, "cookie", origin)).rejects.toThrow();
      await expect(controller.import({ sourceId: randomUUID(), items: [] }, "cookie", origin)).rejects.toThrow();
    }
    expect(session).not.toHaveBeenCalled();
    await expect(controller.replace({ revision: 0, items: [] }, undefined, "http://localhost:3000")).rejects.toThrow("unauthorized");
    expect(shopping.replaceCart).not.toHaveBeenCalled();
    expect(session).toHaveBeenCalledWith(undefined, true);
  });
  it("uses only the authenticated owner and rejects body userId", async () => {
    const session = vi.fn().mockResolvedValue({ id: "owner" });
    const shopping = { setFavorite: vi.fn(), replaceCart: vi.fn(), importCart: vi.fn(), cart: vi.fn(), favorites: vi.fn() };
    const controller = new CustomerShoppingController({ session } as never, shopping as never);
    const origin = "http://localhost:3000";
    vi.stubEnv("WEB_ORIGIN", origin);
    await controller.favorite("product", { active: true }, "cookie", origin);
    await controller.replace({ revision: 0, items: [] }, "cookie", origin);
    await controller.cart("cookie"); await controller.favorites("cookie");
    expect(shopping.setFavorite).toHaveBeenCalledWith("owner", "product", true);
    expect(shopping.replaceCart).toHaveBeenCalledWith("owner", { revision: 0, items: [] });
    expect(shopping.cart).toHaveBeenCalledWith("owner"); expect(shopping.favorites).toHaveBeenCalledWith("owner");
    for (const active of ["true", 1, null]) await expect(controller.favorite("product", { active }, "cookie", origin)).rejects.toThrow("Выберите, добавить товар в избранное или удалить его.");
    await expect(controller.favorite("product", { active: true, userId: "victim" }, "cookie", origin)).rejects.toThrow();
    await expect(controller.replace({ revision: 0, items: [], userId: "victim" }, "cookie", origin)).rejects.toThrow();
  });
});

describe("optional address intercom", () => {
  const address = { street: "Street", building: "1", apartment: "", entrance: "", floor: "", instructions: "" };
  it("accepts missing historical input and validates an explicit intercom", () => {
    expect(parseAddress(address).intercom).toBe("");
    expect(parseSavedAddress({ ...address, label: "home", isDefault: true, intercom: "  12#  " }).intercom).toBe("12#");
    expect(parseAddress({ ...address, housingType: "house", intercom: "Gate 1" }).intercom).toBe("Gate 1");
    for (const intercom of ["x".repeat(31), 123, {}]) expect(() => parseAddress({ ...address, intercom })).toThrow();
  });
});

describe("saved address POST retry", () => {
  const user = { id: "owner", name: null, phone: "+992900000000", phoneVerifiedAt: "2026-10-24T00:00:00Z" };
  const input = parseSavedAddress({ label: "home", isDefault: false, street: "Street", building: "1", intercom: "12#" });
  function setup(overrides = {}) {
    const existing = { ...input, id: "saved", userId: user.id, isDefault: false, ...overrides };
    const addresses = [existing, ...Array.from({ length: 19 }, (_, i) => ({ ...existing, id: `other-${i}`, building: String(i + 2) }))];
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), customerAddress: { findMany: vi.fn().mockResolvedValue(addresses), updateMany: vi.fn(), update: vi.fn(), create: vi.fn() } };
    const prisma = { $transaction: async (work: (value: typeof tx) => unknown) => work(tx), customerAddress: { findMany: vi.fn().mockResolvedValue([]) } };
    return { service: new CustomerAccountService(prisma as never, {} as never), tx, existing };
  }
  it("reuses the normalized exact match even at 20 addresses, upgrading default only when explicit", async () => {
    const { service, tx } = setup({ street: " Street ", intercom: " 12# " });
    await service.saveAddress(user, { ...input, isDefault: true });
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.customerAddress.create).not.toHaveBeenCalled();
    expect(tx.customerAddress.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "saved" }, data: expect.objectContaining({ isDefault: true, intercom: "12#" }) }));
    expect(tx.customerAddress.updateMany).toHaveBeenCalledWith({ where: { userId: user.id, deletedAt: null }, data: { isDefault: false } });
  });
  it("does not downgrade an existing default on retry", async () => {
    const { service, tx } = setup({ isDefault: true });
    await service.saveAddress(user, input);
    expect(tx.customerAddress.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isDefault: true }) }));
    expect(tx.customerAddress.updateMany).not.toHaveBeenCalled();
  });
  it("does not deduplicate different labels, coordinates, instructions or intercom", async () => {
    for (const overrides of [{ label: "work" }, { intercom: "other" }, { instructions: "other" }, { latitude: 38, longitude: 68 }]) {
      const { service, tx } = setup(overrides);
      await expect(service.saveAddress(user, input)).rejects.toThrow("20");
      expect(tx.customerAddress.create).not.toHaveBeenCalled();
      expect(tx.customerAddress.update).not.toHaveBeenCalled();
    }
  });
});

describe("shopping service transactions", () => {
  function setup(saved = { revision: 4, items: [line()] }) {
    const product = { id: "product", slug: "canonical", name: "Canonical", nameTj: "Canonical TJ", imageUrl: null, images: [], unit: "kg", isWeighted: true,
      minQuantity: "0.5", quantityStep: "0.25", deletedAt: null, isActive: true, isAvailableToday: true, category: { isActive: true, deletedAt: null } };
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), product: { findMany: vi.fn().mockResolvedValue([product]), findFirst: vi.fn().mockResolvedValue(product) },
      customerCart: { findUnique: vi.fn().mockResolvedValue(saved), upsert: vi.fn() },
      customerCartImport: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
      customerFavorite: { findUnique: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(500), create: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]) } };
    const prisma = { $transaction: async (work: (value: typeof tx) => unknown) => work(tx) };
    return { service: new CustomerShoppingService(prisma as never), tx };
  }
  it("locks the authenticated owner before reading and preserves observed prices while using DB metadata", async () => {
    const { service, tx } = setup();
    const result = await service.replaceCart("owner", { revision: 4, items: [line({ name: "Forged", sellingPrice: "999", quantity: "1.125" })] });
    expect(tx.$queryRaw.mock.calls[0][1]).toBe("owner");
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.customerCart.findUnique.mock.invocationCallOrder[0]);
    expect(result).toMatchObject({ revision: 5, items: [{ name: "Canonical", slug: "canonical", sellingPrice: "12.50", quantity: "1.125" }] });
    expect(tx.customerCart.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "owner" } }));
  });
  it("returns the current CAS snapshot without writing on revision mismatch", async () => {
    const { service, tx } = setup();
    try { await service.replaceCart("owner", { revision: 3, items: [] }); throw new Error("Expected conflict"); }
    catch (error) {
      expect(error).toHaveProperty("status", 409);
      expect((error as { getResponse(): unknown }).getResponse()).toMatchObject({ revision: 4, items: [{ name: "Canonical", quantity: "0.75" }] });
    }
    expect(tx.customerCart.upsert).not.toHaveBeenCalled();
  });
  it("never replays an already imported source or revives removed rows", async () => {
    const { service, tx } = setup({ revision: 4, items: [] });
    tx.customerCartImport.findUnique.mockResolvedValue({ sourceId: "already-imported" } as never);
    const result = await service.importCart("owner", { sourceId: "already-imported", items: [line()] });
    expect(result).toEqual({ revision: 4, items: [] });
    expect(tx.customerCart.upsert).not.toHaveBeenCalled(); expect(tx.customerCartImport.create).not.toHaveBeenCalled();
    expect(tx.customerCartImport.findUnique).toHaveBeenCalledWith({ where: { userId_sourceId: { userId: "owner", sourceId: "already-imported" } } });
  });
  it("does not mutate a saved legacy snapshot during CAS save", async () => {
    const legacy = line({ qualityOptionId: "old", qualityOptionLabel: "Historical", quantity: "0.751", sellingPrice: "3.00" });
    const { service, tx } = setup({ revision: 4, items: [legacy] });
    const incoming = line({ qualityOptionId: "old", qualityOptionLabel: "Changed", quantity: "99" });
    await expect(service.replaceCart("owner", { revision: 4, items: [incoming] })).rejects.toMatchObject({ status: 422, response: {
      code: "CART_LEGACY_REVIEW_REQUIRED", retryable: false, currentCart: { revision: 4, items: [legacy] }, conflicts: [{ saved: legacy, incoming }]
    } });
    expect(tx.customerCart.upsert).not.toHaveBeenCalled();
    expect((await service.replaceCart("owner", { revision: 4, items: [] })).items).toEqual([]);
  });
  it("preserves exact saved legacy snapshots on import while accepting new orphaned guest legacy lines", async () => {
    const legacy = line({ qualityOptionId: "old", qualityOptionLabel: "Historical", quantity: "0.751", sellingPrice: "3.00" });
    const labelOnly = line({ qualityOptionLabel: "Historical label", quantity: "0.752" });
    const guestLegacy = line({ productId: "missing", qualityOptionId: "guest-old", qualityOptionLabel: "Guest snapshot", quantity: "0.753" });
    const { service, tx } = setup({ revision: 4, items: [legacy, labelOnly] });
    const changed = line({ qualityOptionId: "old", qualityOptionLabel: "Changed", quantity: "99" });
    await expect(service.importCart("owner", { sourceId: randomUUID(), items: [changed, guestLegacy] })).rejects.toMatchObject({ status: 422, response: {
      code: "CART_LEGACY_REVIEW_REQUIRED", retryable: false, currentCart: { revision: 4, items: [legacy, labelOnly] }, conflicts: [{ saved: legacy, incoming: changed }]
    } });
    expect(tx.customerCart.upsert).not.toHaveBeenCalled(); expect(tx.customerCartImport.create).not.toHaveBeenCalled();
    const result = await service.importCart("owner", { sourceId: randomUUID(), items: [legacy, labelOnly, guestLegacy] });
    expect(result).toEqual({ revision: 5, items: [legacy, labelOnly, guestLegacy] });
  });
  it("returns both quantities for explicit review on an ordinary/legacy collision, in both directions", async () => {
    const legacy = line({ qualityOptionLabel: "Historical preference", quantity: "0.751", sellingPrice: "2.00" });
    for (const [saved, incoming] of [[line({ quantity: "90" }), legacy], [legacy, line({ quantity: "90" })]]) {
      const { service, tx } = setup({ revision: 4, items: [saved] });
      for (const work of [() => service.importCart("owner", { sourceId: randomUUID(), items: [incoming] }), () => service.replaceCart("owner", { revision: 4, items: [incoming] })]) {
        await expect(work()).rejects.toMatchObject({ status: 422, response: {
          code: "CART_LEGACY_REVIEW_REQUIRED", retryable: false, conflicts: [{ saved: expect.objectContaining({ quantity: saved.quantity, qualityOptionLabel: saved.qualityOptionLabel }), incoming }]
        } });
      }
      expect(tx.customerCart.upsert).not.toHaveBeenCalled(); expect(tx.customerCartImport.create).not.toHaveBeenCalled();
    }
  });
  it("uses Russian dictionary keys for missing favorites and revision exhaustion", async () => {
    const { service, tx } = setup({ revision: 2147483647, items: [] });
    tx.product.findFirst.mockResolvedValue(null as never);
    await expect(service.setFavorite("owner", "missing", true)).rejects.toThrow("Товар не найден.");
    await expect(service.importCart("owner", { sourceId: randomUUID(), items: [] })).rejects.toThrow("Не удалось сохранить корзину. Обновите страницу и попробуйте снова.");
    expect(tx.customerCart.upsert).not.toHaveBeenCalled(); expect(tx.customerCartImport.create).not.toHaveBeenCalled();
  });
  it("enforces favorite capacity after locking and scopes explicit removal to the owner", async () => {
    const { service, tx } = setup();
    await expect(service.setFavorite("owner", "product", true)).rejects.toThrow("Можно сохранить не больше 500 товаров в избранном.");
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.customerFavorite.count.mock.invocationCallOrder[0]);
    expect(tx.customerFavorite.create).not.toHaveBeenCalled();
    await service.setFavorite("owner", "product", false);
    expect(tx.customerFavorite.deleteMany).toHaveBeenCalledWith({ where: { userId: "owner", productId: "product" } });
  });
});
