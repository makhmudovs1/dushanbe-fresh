import { describe, expect, it, vi } from "vitest";
import { CART_KEY, CartStore, decodeCart, type Storage } from "./cart-store";
import { potato } from "../domain/fixtures.test-support";
function memory(): Storage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: async (k) => values.get(k) ?? null,
    setItem: async (k, v) => {
      values.set(k, v);
    },
  };
}
describe("durable cart", () => {
  it("restores guest items after a new app instance", async () => {
    const storage = memory();
    const first = new CartStore(storage);
    await first.hydrate();
    first.dispatch({ type: "change", product: potato, direction: 1 });
    await first.flushed();
    const second = new CartStore(storage);
    await second.hydrate();
    expect(second.getSnapshot().items[0]?.quantity).toBe("0.5");
  });
  it("never overwrites storage before hydration", async () => {
    const storage = memory();
    const set = vi.spyOn(storage, "setItem");
    const store = new CartStore(storage);
    store.dispatch({ type: "clear" });
    await store.flushed();
    expect(set).not.toHaveBeenCalled();
  });
  it("serializes a slow add before a later clear", async () => {
    const storage = memory();
    const original = storage.setItem;
    let finish: (() => void) | undefined;
    storage.setItem = vi
      .fn()
      .mockImplementationOnce(
        (k, v) =>
          new Promise<void>((resolve) => {
            finish = () => {
              void original(k, v).then(resolve);
            };
          }),
      )
      .mockImplementation(original);
    const store = new CartStore(storage);
    await store.hydrate();
    store.dispatch({ type: "change", product: potato, direction: 1 });
    await Promise.resolve();
    store.dispatch({ type: "clear" });
    finish?.();
    await store.flushed();
    expect(decodeCart(await storage.getItem(CART_KEY))).toEqual([]);
  });
  it("preserves unreadable data and allows retry", async () => {
    const storage = memory();
    storage.values.set(CART_KEY, "damaged");
    const store = new CartStore(storage);
    await store.hydrate();
    store.dispatch({ type: "clear" });
    expect(store.getSnapshot()).toMatchObject({
      hydrated: false,
      error: "read",
    });
    expect(await storage.getItem(CART_KEY)).toBe("damaged");
    storage.values.delete(CART_KEY);
    await store.retryRead();
    expect(store.getSnapshot().hydrated).toBe(true);
  });
  it("shows write failures while keeping the in-memory selection", async () => {
    const storage = memory();
    const original = storage.setItem;
    storage.setItem = async () => {
      throw new Error("disk");
    };
    const store = new CartStore(storage);
    await store.hydrate();
    store.dispatch({ type: "change", product: potato, direction: 1 });
    expect(await store.flushed()).toBe(false);
    expect(store.getSnapshot().items).toHaveLength(1);
    expect(store.getSnapshot().error).toBe("write");
    storage.setItem = original;
    expect(await store.persist()).toBe(true);
    expect(store.getSnapshot().error).toBe(null);
  });
  it("rejects duplicate, incompatible and unsupported snapshots", () => {
    const item = { product: potato, quantity: "0.5" };
    expect(() =>
      decodeCart(JSON.stringify({ version: 1, items: [item, item] })),
    ).toThrow();
    expect(() =>
      decodeCart(JSON.stringify({ version: 2, items: [] })),
    ).toThrow();
    expect(() =>
      decodeCart(
        JSON.stringify({ version: 1, items: [{ ...item, quantity: "0.7" }] }),
      ),
    ).toThrow();
  });
});
