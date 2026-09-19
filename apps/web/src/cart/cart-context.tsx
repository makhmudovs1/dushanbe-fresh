"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState
} from "react";

import {
  CartItem,
  cartReducer,
  CartState,
  createCartItem,
  emptyCartState,
  getCartItemKey,
  loadCart,
  saveCart
} from "./cart";
import { Product } from "@/lib/api";

type AddProductInput = {
  product: Product;
  quantity: string;
  qualityOptionId?: string | null;
};

type CartContextValue = {
  state: CartState;
  addProduct: (input: AddProductInput) => void;
  incrementItem: (item: CartItem) => void;
  decrementItem: (item: CartItem) => void;
  removeItem: (item: CartItem) => void;
  lineCount: number;
  hydrated: boolean;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, emptyCartState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    dispatch({ type: "hydrate", state: loadCart(window.localStorage) });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      saveCart(window.localStorage, state);
    }
  }, [hydrated, state]);

  const value = useMemo<CartContextValue>(
    () => ({
      state,
      hydrated,
      clearCart: () => {
        dispatch({ type: "clear" });
        try { saveCart(window.localStorage, emptyCartState); } catch { /* The in-memory cart is still cleared when storage is blocked. */ }
      },
      addProduct: (input) => {
        dispatch({ type: "add", item: createCartItem(input) });
      },
      incrementItem: (item) => {
        dispatch({ type: "increment", key: getCartItemKey(item) });
      },
      decrementItem: (item) => {
        dispatch({ type: "decrement", key: getCartItemKey(item) });
      },
      removeItem: (item) => {
        dispatch({ type: "remove", key: getCartItemKey(item) });
      },
      lineCount: state.items.length
    }),
    [state, hydrated]
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
