import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreateOrderInput } from "@dushanbe-fresh/shared";
import { cartReducer, loadCart, saveCart } from "../cart/cart";
import { finishCheckout } from "./checkout";

afterEach(() => { vi.unstubAllGlobals(); });

describe("checkout completion", () => {
  it("clears the cart and stored cart only after a successful server response", async () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    let state = { items: [{ productId: "tomatoes", slug: "tomatoes", name: "Помидоры", imageUrl: null,
      unit: "kg", sellingPrice: "10.50", isWeighted: true, quantity: "12", minQuantity: "0.5",
      quantityStep: "0.25", qualityOptionId: null, qualityOptionLabel: null }] };
    const clear = vi.fn(() => {
      const cleared = cartReducer(state, { type: "clear" });
      state = { items: [] };
      saveCart(storage as never, cleared);
    });
    let resolve!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(done => { resolve = done; })));
    const pending = finishCheckout({} as CreateOrderInput, clear);
    expect(clear).not.toHaveBeenCalled();
    expect(state.items).toHaveLength(1);
    resolve({ ok: true, json: async () => ({ orderNumber: "DF-test" }) });
    await pending;
    expect(clear).toHaveBeenCalledOnce();
    storage.getItem.mockReturnValue(storage.setItem.mock.calls[0][1]);
    expect(loadCart(storage as never).items).toEqual([]);
  });
  it("keeps cart contents when the server rejects the order", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ message: "Окно заполнено" }) }));
    const clear = vi.fn();
    await expect(finishCheckout({} as CreateOrderInput, clear)).rejects.toThrow("Окно заполнено");
    expect(clear).not.toHaveBeenCalled();
  });
  it("keeps cart contents when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const clear = vi.fn();
    await expect(finishCheckout({} as CreateOrderInput, clear)).rejects.toThrow("network");
    expect(clear).not.toHaveBeenCalled();
  });
});
