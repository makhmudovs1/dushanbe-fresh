import { api } from "../api/config";
import { apiStorageScope, guestClaimKey } from "../domain/storage-scope";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { randomUUID } from "expo-crypto";
import { CartStore } from "./cart-store";
import { AccountCartStore, type AccountCartState } from "./account-cart-store";
import { nativeLine, serverLine } from "../domain/account-cart";
import { sessionManager, useSession } from "./session";
const scope = apiStorageScope(api.baseUrl);
const guestStore = new CartStore(
  AsyncStorage,
  `df.mobile.guest-cart.v2.${scope}`,
);
const Empty: AccountCartState = {
  items: [],
  hydrated: false,
  syncing: false,
  error: null,
  conflicts: [],
};
const noop = () => () => {};
const Context = createContext<AccountCartStore | null>(null);
export function ShoppingProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const [engine, setEngine] = useState<AccountCartStore | null>(null);
  const guest = useSyncExternalStore(
    guestStore.subscribe,
    guestStore.getSnapshot,
    guestStore.getSnapshot,
  );
  useEffect(() => {
    void guestStore.hydrate();
  }, []);
  useEffect(() => {
    if (!session.user?.id || !guest.hydrated) {
      setEngine(null);
      return;
    }
    const owner = session.user.id;
    const store = new AccountCartStore(
      owner,
      AsyncStorage,
      (path, options) =>
        sessionManager.request(path, { ...options, ownerId: owner }),
      randomUUID,
      () => guestStore.getSnapshot().items.map(serverLine),
      async (imported) => {
        for (const line of guestStore.getSnapshot().items)
          if (
            imported.some(
              (i) =>
                i.productId === line.product.id && i.quantity === line.quantity,
            )
          )
            guestStore.dispatch({ type: "remove", id: line.product.id });
        if (!(await guestStore.persist())) throw new Error("GUEST_NOT_SAVED");
      },
      scope,
    );
    setEngine(store);
    void store.initialize();
    const timer = setInterval(() => {
      void store.sync();
    }, 30000);
    const focus = AppState.addEventListener("change", (s) => {
      if (s === "active") void store.sync();
    });
    return () => {
      store.dispose();
      clearInterval(timer);
      focus.remove();
    };
  }, [session.user?.id, guest.hydrated]);
  return (
    <Context.Provider
      value={engine?.owner === session.user?.id ? engine : null}
    >
      {children}
    </Context.Provider>
  );
}
export function useShoppingCart() {
  const session = useSession();
  const engine = useContext(Context);
  const account = useSyncExternalStore(
    engine?.subscribe ?? noop,
    engine?.getSnapshot ?? (() => Empty),
    engine?.getSnapshot ?? (() => Empty),
  );
  const guest = useSyncExternalStore(
    guestStore.subscribe,
    guestStore.getSnapshot,
    guestStore.getSnapshot,
  );
  const [claim, setClaim] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    setClaim(null);
    void AsyncStorage.getItem(guestClaimKey(api.baseUrl))
      .then((raw) => {
        if (alive) setClaim(!!raw);
      })
      .catch(() => {
        if (alive) setClaim(true);
      });
    return () => {
      alive = false;
    };
  }, [session.phase]);
  if (session.phase !== "guest")
    return {
      items: account.items.map(nativeLine),
      hydrated: session.phase === "account" && account.hydrated,
      error: null,
      dispatch: (action: Parameters<CartStore["dispatch"]>[0]) =>
        engine?.apply(action),
      persist: () => engine?.flush() ?? Promise.resolve(false),
      retryRead: () => engine?.initialize(),
      syncError: session.phase === "locked" ? "session" : account.error,
      syncing: account.syncing,
      retrySync: () => {
        if (session.phase === "locked") void sessionManager.restore();
        else void engine?.sync(true);
      },
      conflicts: account.conflicts,
      resolveConflict: (key: string, both: boolean) =>
        engine?.resolve(key, both),
      account: true,
    };
  return {
    ...guest,
    items: claim ? [] : guest.items,
    hydrated: guest.hydrated && claim !== null,
    dispatch: guestStore.dispatch,
    persist: guestStore.persist,
    retryRead: guestStore.retryRead,
    syncError: null,
    syncing: false,
    retrySync: () => {},
    conflicts: [],
    resolveConflict: () => Promise.resolve(),
    account: false,
  };
}
