import { describe, expect, it } from "vitest";

import {
  calculateCartSubtotalMinor,
  cartReducer,
  createCartItem,
  emptyCartState,
  formatMoneyFromMinor,
  getCartItemKey,
  hasWeightedItems,
  loadCart,
  saveCart,
  sumCartQuantities
} from "./cart";
import { Product } from "@/lib/api";

const tomatoes: Product = {
  id: "product-tomatoes",
  name: "Помидоры",
  slug: "tomatoes",
  description: "Свежие помидоры",
  image: "/img/products/tomatoes.jpg",
  unit: "kg",
  sellingPrice: "10.50",
  isWeighted: true,
  minQuantity: "0.5",
  quantityStep: "0.5",
  category: {
    id: "cat-vegetables",
    name: "Овощи",
    slug: "vegetables"
  },
  qualityOptions: [
    { id: "ripe", label: "спелые", sortOrder: 10 },
    { id: "firm", label: "твёрдые", sortOrder: 20 },
    { id: "picker", label: "на выбор сборщика", sortOrder: 30 }
  ]
};

const cilantro: Product = {
  ...tomatoes,
  id: "product-cilantro",
  name: "Кинза",
  slug: "cilantro",
  image: "/img/products/cilantro.jpg",
  unit: "bunch",
  sellingPrice: "2.50",
  isWeighted: false,
  minQuantity: "1",
  quantityStep: "1",
  qualityOptions: []
};

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("cart", () => {
  it("explicit null adds without a quality preference while old explicit options remain intact", () => {
    const plain = createCartItem({ product: tomatoes, quantity: "0.5", qualityOptionId: null });
    expect(plain.qualityOptionId).toBeNull();
    expect(plain.qualityOptionLabel).toBeNull();
    const saved = createCartItem({ product: tomatoes, quantity: "1.5", qualityOptionId: "ripe" });
    const state = cartReducer({ items: [saved] }, { type: "add", item: plain });
    expect(state.items).toHaveLength(2);
    expect(state.items[0]).toEqual(saved);
    expect(sumCartQuantities(state.items)).toBe("2");
  });
  it("sums saved variant quantities exactly without merging or rewriting them", () => {
    const items = [{ quantity: "0.1" }, { quantity: "0.2" }, { quantity: "0.375" }];
    expect(sumCartQuantities(items)).toBe("0.675");
    expect(items.map(item => item.quantity)).toEqual(["0.1", "0.2", "0.375"]);
    expect(sumCartQuantities([])).toBe("0");
  });
  it("adds a product", () => {
    const item = createCartItem({
      product: tomatoes,
      quantity: "0.5",
      qualityOptionId: "ripe"
    });
    const state = cartReducer(emptyCartState, { type: "add", item });

    expect(state.items).toHaveLength(1);
    expect(state.items[0]?.name).toBe("Помидоры");
    expect(state.items[0]?.qualityOptionLabel).toBe("спелые");
  });

  it("repeated add increases quantity for the same quality option", () => {
    const item = createCartItem({
      product: tomatoes,
      quantity: "0.5",
      qualityOptionId: "ripe"
    });
    const firstState = cartReducer(emptyCartState, { type: "add", item });
    const secondState = cartReducer(firstState, { type: "add", item });

    expect(secondState.items).toHaveLength(1);
    expect(secondState.items[0]?.quantity).toBe("1");
  });

  it("keeps different quality options as separate lines", () => {
    const ripeItem = createCartItem({
      product: tomatoes,
      quantity: "0.5",
      qualityOptionId: "ripe"
    });
    const firmItem = createCartItem({
      product: tomatoes,
      quantity: "0.5",
      qualityOptionId: "firm"
    });
    const state = cartReducer(cartReducer(emptyCartState, { type: "add", item: ripeItem }), {
      type: "add",
      item: firmItem
    });

    expect(state.items).toHaveLength(2);
  });

  it("decreases quantity", () => {
    const item = createCartItem({
      product: tomatoes,
      quantity: "1.5",
      qualityOptionId: "ripe"
    });
    const state = cartReducer(emptyCartState, { type: "add", item });
    const nextState = cartReducer(state, {
      type: "decrement",
      key: getCartItemKey(item)
    });

    expect(nextState.items[0]?.quantity).toBe("1");
  });

  it("does not decrease quantity below minQuantity", () => {
    const item = createCartItem({
      product: tomatoes,
      quantity: "0.5",
      qualityOptionId: "ripe"
    });
    const state = cartReducer(emptyCartState, { type: "add", item });
    const nextState = cartReducer(state, {
      type: "decrement",
      key: getCartItemKey(item)
    });

    expect(nextState.items[0]?.quantity).toBe("0.5");
  });

  it("removes a product", () => {
    const item = createCartItem({
      product: tomatoes,
      quantity: "0.5",
      qualityOptionId: "ripe"
    });
    const state = cartReducer(emptyCartState, { type: "add", item });
    const nextState = cartReducer(state, {
      type: "remove",
      key: getCartItemKey(item)
    });

    expect(nextState.items).toHaveLength(0);
  });

  it("saves and restores cart state", () => {
    const storage = new MemoryStorage();
    const item = createCartItem({
      product: tomatoes,
      quantity: "0.5",
      qualityOptionId: "ripe"
    });
    const state = cartReducer(emptyCartState, { type: "add", item });

    saveCart(storage, state);

    expect(loadCart(storage)).toEqual(state);
  });

  it("calculates approximate subtotal", () => {
    const tomatoItem = createCartItem({
      product: tomatoes,
      quantity: "1.5",
      qualityOptionId: "ripe"
    });
    const cilantroItem = createCartItem({
      product: cilantro,
      quantity: "2"
    });
    const state = cartReducer(
      cartReducer(emptyCartState, { type: "add", item: tomatoItem }),
      { type: "add", item: cilantroItem }
    );

    expect(formatMoneyFromMinor(calculateCartSubtotalMinor(state))).toBe("20.75");
  });

  it("detects weighted products", () => {
    const item = createCartItem({
      product: tomatoes,
      quantity: "0.5",
      qualityOptionId: "ripe"
    });
    const state = cartReducer(emptyCartState, { type: "add", item });

    expect(hasWeightedItems(state)).toBe(true);
  });
});
