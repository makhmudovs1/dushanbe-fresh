import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomerError, customerRequest } from "./customer";

afterEach(() => { vi.unstubAllGlobals(); });
describe("customer transport", () => {
  it("sanitizes network errors to a localizable message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Private transport details")));
    await expect(customerRequest("customer-auth/status")).rejects.toMatchObject({ status: 0, message: "Не удалось связаться с магазином. Проверьте соединение и попробуйте снова." });
  });
  it("keeps a null anonymous session and preserves structured conflict details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("null")).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Review", code: "CART_LEGACY_REVIEW_REQUIRED", conflicts: [] }), { status: 422 })));
    expect(await customerRequest("customer-auth/me")).toBeNull();
    try { await customerRequest("customer/cart/import", "POST", { sourceId: "test" }); throw new Error("Expected rejection"); }
    catch (error) { expect(error).toBeInstanceOf(CustomerError); expect(error).toMatchObject({ status: 422, data: { code: "CART_LEGACY_REVIEW_REQUIRED", conflicts: [] } }); }
  });
});
