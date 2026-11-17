import { api } from "../api/config";
import { apiStorageScope } from "../domain/storage-scope";
import { parseAddressDraft, sameAddress, refreshSavedAddress } from "../domain/address";
import { useQueryClient } from "@tanstack/react-query";
import { useSession, sessionManager } from "./session";
import { useSavedAddresses } from "./customer-data";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { Alert } from "react-native";
import type { AddressInput, SavedAddress } from "@dushanbe-fresh/shared";
import { ShoppingProvider, useShoppingCart } from "./shopping";
import { translate, type Locale } from "../i18n";
export type DeliveryAddress = AddressInput & {
  label: "home" | "work" | "other";
};
const ADDRESS_KEY = `df.mobile.address.v2.${apiStorageScope(api.baseUrl)}`;
const Context = createContext<{
  locale: Locale;
  t: (key: string) => string;
  changeLocale: (locale: Locale) => Promise<void>;
  address: DeliveryAddress | null;
  addressReady: boolean;
  addressRevision: number;
  saveAddress: (address: DeliveryAddress, id?: string) => Promise<void>;
  chooseAddress: (address: SavedAddress) => void;
} | null>(null);
export function AppState({ children }: { children: ReactNode }) {
  const session = useSession();
  const saved = useSavedAddresses();
  const client = useQueryClient();
  const [owner, setOwner] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const addressVersion = useRef(0);
  const [locale, setLocale] = useState<Locale>("ru");
  const [address, setAddress] = useState<DeliveryAddress | null>(null);
  const [addressReady, setAddressReady] = useState(false);
  useEffect(() => {
    void AsyncStorage.getItem("df.mobile.locale")
      .then((v) => {
        if (v === "ru" || v === "tg") setLocale(v);
      })
      .catch(() => {});
    const version = addressVersion.current;
    void AsyncStorage.getItem(ADDRESS_KEY)
      .then((v) => {
        if (!v || version !== addressVersion.current) return;
        const data = JSON.parse(v);
        if (
          data.expiresAt > Date.now() &&
          typeof data.address?.street === "string" &&
          typeof data.address.building === "string"
        )
          setAddress(parseAddressDraft(data.address));
      })
      .catch(() => {})
      .finally(() => setAddressReady(true));
  }, []);
  const changeLocale = async (next: Locale) => {
    setLocale(next);
    try {
      await AsyncStorage.setItem("df.mobile.locale", next);
    } catch {
      Alert.alert(translate(next, "Не удалось сохранить язык"));
    }
  };
  useEffect(() => {
    if (session.phase === "restoring") return;
    const next = session.user?.id ?? null;
    if (owner && owner !== next) {
      addressVersion.current++;
      setAddress(null);
      setSelectedId(null);
      setOwner(null);
      void AsyncStorage.removeItem(ADDRESS_KEY);
    } else if (!owner && next && address) {
      setOwner(next);
    }
  }, [session.phase, session.user?.id, owner, address]);
  useEffect(() => {
    if (session.phase !== "account" || !saved.data) return;
    const next = refreshSavedAddress(address, selectedId, saved.data);
    if (next.selectedId !== selectedId) setSelectedId(next.selectedId);
    if (next.address !== address) {
      setAddress(next.address);
      setOwner(session.user!.id);
    }
  }, [saved.data, session.phase, session.user?.id, selectedId, address]);
  const chooseAddress = (next: SavedAddress) => {
    addressVersion.current++;
    setAddress(next);
    setSelectedId(next.id);
    setOwner(session.user?.id ?? null);
  };
  const saveAddress = async (next: DeliveryAddress, id?: string) => {
    addressVersion.current++;
    if (session.phase === "account") {
      const { isDefault: unused, ...clean } = next as DeliveryAddress & {
        isDefault?: boolean;
      };
      void unused;
      const addresses = await sessionManager.request<SavedAddress[]>(
        id
          ? `/mobile/customer/addresses/${encodeURIComponent(id)}`
          : "/mobile/customer/addresses",
        {
          method: id ? "PATCH" : "POST",
          ownerId: session.user?.id,
          body: { ...clean, isDefault: false },
        },
      );
      client.setQueryData(["addresses", session.user!.id], addresses);
      const selected = id
        ? addresses.find((a) => a.id === id)
        : addresses.find((a) => sameAddress(a, next));
      setSelectedId(selected?.id ?? null);
      setOwner(session.user!.id);
      setAddress(next);
    } else {
      if (session.phase !== "guest") throw new Error("SESSION_LOCKED");
      await AsyncStorage.setItem(
        ADDRESS_KEY,
        JSON.stringify({ address: next, expiresAt: Date.now() + 86400000 }),
      );
      setOwner(null);
      setAddress(next);
    }
  };
  const visibleAddress = owner && owner !== session.user?.id ? null : address;
  return (
    <Context.Provider
      value={{
        locale,
        t: (text) => translate(locale, text),
        changeLocale,
        address: visibleAddress,
        addressReady,
        addressRevision: addressVersion.current,
        saveAddress,
        chooseAddress,
      }}
    >
      <ShoppingProvider>{children}</ShoppingProvider>
    </Context.Provider>
  );
}
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("AppState required");
  return value;
}
export function useCart() {
  return useShoppingCart();
}
