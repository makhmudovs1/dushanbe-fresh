"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  CartAction, CartItem, CartState, cartReducer, createCartItem, emptyCartState, getCartItemKey, saveCart
} from "./cart";
import { AccountCartSync, CartLegacyConflict, CartSyncView, loadGuestCart, sameCartItems } from "./account-cart";
import { useOptionalCustomer } from "@/customer/customer-context";
import { getProducts, Product } from "@/lib/api";
import { customerRequest } from "@/lib/customer";

type AddProductInput = {
  product: Product;
  quantity: string;
  qualityOptionId?: string | null;
};

type CartContextValue = {
  state: CartState;
  addProduct: (input: AddProductInput) => void;
  repeatProducts: (items: AddProductInput[]) => void;
  incrementItem: (item: CartItem) => void;
  decrementItem: (item: CartItem) => void;
  removeItem: (item: CartItem) => void;
  lineCount: number;
  hydrated: boolean;
  clearCart: () => void;
  syncError: string;
  syncing: boolean;
  retrySync: () => void;
  lastAddition: number;
  legacyConflicts: CartLegacyConflict[];
  discardIncoming: (key: string) => void;
  removeBoth: (key: string) => void;
};

type Runtime = { owner: string | null; view: CartSyncView; session?: AccountCartSync };
const initialView: CartSyncView = { state: emptyCartState, hydrated: false, syncing: false, syncError: "", legacyConflicts: [] };
const CartContext = createContext<CartContextValue | null>(null);

function browserStorage() {
  try { return window.localStorage; } catch { return undefined; }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const customer = useOptionalCustomer();
  const user = customer?.user;
  const owner = !customer?.loading && customer?.status.enabled && user?.phoneVerifiedAt && user.name?.trim() ? user.id : null;
  const runtime = useRef<Runtime | null>(null);
  const [published, setPublished] = useState<{ owner: string | null; view: CartSyncView } | null>(null);
  const [lastAddition, setLastAddition] = useState(0);
  // Mask the previous owner's data during the render before the identity effect runs.
  const view = published?.owner === owner ? published.view : initialView;

  useEffect(() => {
    const current: Runtime = { owner, view: initialView };
    runtime.current = current;
    const publish = (next: CartSyncView) => {
      if (runtime.current !== current) return;
      current.view = next;
      setPublished({ owner, view: next });
    };
    if (owner) {
      current.session = new AccountCartSync(owner, browserStorage(), customerRequest, () => crypto.randomUUID(), publish);
      void current.session.start();
    } else {
      publish({ ...initialView, state: loadGuestCart(browserStorage()), hydrated: true });
    }
    return () => {
      current.session?.dispose();
      if (runtime.current === current) runtime.current = null;
    };
  }, [owner]);

  const apply = useCallback((action: CartAction) => {
    const current = runtime.current;
    if (!current || current.owner !== owner) return false;
    if (current.session) return current.session.apply(action);
    if (!current.view.hydrated) return false;
    const state = cartReducer(current.view.state, action);
    if (sameCartItems(state.items, current.view.state.items) && action.type !== "clear") return false;
    let syncError = "";
    try {
      const storage = browserStorage();
      if (!storage) throw new Error("Storage unavailable");
      saveCart(storage, state);
    } catch { syncError = "Не удалось сохранить корзину на устройстве."; }
    current.view = { ...current.view, state, syncError };
    setPublished({ owner, view: current.view });
    return true;
  }, [owner]);

  useEffect(() => {
    const current = runtime.current;
    if (!current || current.owner !== owner || !view.hydrated || !current.view.state.items.length) return;
    const controller = new AbortController();
    void getProducts(undefined, controller.signal).then(products => {
      if (!controller.signal.aborted && runtime.current === current && Array.isArray(products)) {
        apply({ type: "refresh-quantity-rules", products });
      }
    }).catch(() => { /* Saved metadata remains usable; checkout validates server-side. */ });
    return () => controller.abort();
  }, [owner, view.hydrated, apply]);

  const retrySync = useCallback(() => {
    const current = runtime.current;
    if (!current || current.owner !== owner) return;
    if (current.session) current.session.retrySync();
    else {
      try {
        const storage = browserStorage();
        if (!storage) return;
        saveCart(storage, current.view.state);
        current.view = { ...current.view, syncError: "" };
        setPublished({ owner, view: current.view });
      } catch { /* Keep the visible storage error. */ }
    }
  }, [owner]);

  const value = useMemo<CartContextValue>(
    () => ({
      ...view,
      lastAddition,
      retrySync,
      discardIncoming: key => {
        const current = runtime.current;
        if (current?.owner === owner) current.session?.discardIncoming(key);
      },
      removeBoth: key => {
        const current = runtime.current;
        if (current?.owner === owner) current.session?.removeBoth(key);
      },
      clearCart: () => { apply({ type: "clear" }); },
      addProduct: (input) => {
        if (apply({ type: "add", item: createCartItem(input) })) setLastAddition(value => value + 1);
      },
      repeatProducts: items => { apply({ type: "repeat", items: items.map(createCartItem) }); },
      incrementItem: (item) => {
        apply({ type: "increment", key: getCartItemKey(item) });
      },
      decrementItem: (item) => {
        apply({ type: "decrement", key: getCartItemKey(item) });
      },
      removeItem: (item) => {
        apply({ type: "remove", key: getCartItemKey(item) });
      },
      lineCount: view.state.items.length
    }),
    [view, lastAddition, retrySync, apply, owner]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used inside CartProvider");
  }

  return context;
}
