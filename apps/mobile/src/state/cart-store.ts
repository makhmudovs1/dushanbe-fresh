import { isProduct } from "../domain/catalog";
import { reduceCart, type CartLine, type CartAction } from "../domain/cart";
import { validQuantity } from "../domain/decimal";
export type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};
export type CartState = {
  items: CartLine[];
  hydrated: boolean;
  error: "read" | "write" | null;
};
export const CART_KEY = "df.mobile.guest-cart.v1";
export function decodeCart(raw: string | null): CartLine[] {
  if (raw === null) return [];
  const saved: unknown = JSON.parse(raw);
  if (
    !saved ||
    typeof saved !== "object" ||
    !("version" in saved) ||
    saved.version !== 1 ||
    !("items" in saved) ||
    !Array.isArray(saved.items) ||
    saved.items.length > 100
  )
    throw new Error("INVALID_CART");
  const ids = new Set<string>();
  for (const item of saved.items) {
    if (
      !item ||
      !isProduct(item.product) ||
      typeof item.quantity !== "string" ||
      !validQuantity(
        item.quantity,
        item.product.minQuantity,
        item.product.quantityStep,
      ) ||
      ids.has(item.product.id)
    )
      throw new Error("INVALID_CART");
    ids.add(item.product.id);
  }
  return saved.items as CartLine[];
}
// One writer serializes snapshots; a slow previous write cannot restore removed lines.
export class CartStore {
  private state: CartState = { items: [], hydrated: false, error: null };
  private listeners = new Set<() => void>();
  private queue: Promise<boolean> = Promise.resolve(true);
  private loading: Promise<void> | undefined;
  constructor(
    private storage: Storage,
    private key = CART_KEY,
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(state: CartState) {
    this.state = state;
    this.listeners.forEach((fn) => fn());
  }
  hydrate = (): Promise<void> => {
    this.loading ??= this.storage
      .getItem(this.key)
      .then((raw) =>
        this.emit({ items: decodeCart(raw), hydrated: true, error: null }),
      )
      .catch(() => this.emit({ ...this.state, error: "read" }));
    return this.loading;
  };
  retryRead = () => {
    this.loading = undefined;
    return this.hydrate();
  };
  dispatch = (action: CartAction) => {
    if (!this.state.hydrated) return;
    const items = reduceCart(this.state.items, action);
    this.emit({ ...this.state, items });
    this.persist();
  };
  persist = () => {
    if (!this.state.hydrated) return this.queue;
    const payload = JSON.stringify({ version: 1, items: this.state.items });
    this.queue = this.queue
      .then(() => this.storage.setItem(this.key, payload))
      .then(() => {
        this.emit({ ...this.state, error: null });
        return true;
      })
      .catch(() => {
        this.emit({ ...this.state, error: "write" });
        return false;
      });
    return this.queue;
  };
  flushed = () => this.queue;
}
