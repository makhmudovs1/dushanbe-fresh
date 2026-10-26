"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { ChevronDown, MapPin } from "lucide-react";
import type { AddressInput, SavedAddress } from "@dushanbe-fresh/shared";
import { AddressPicker, type AddressMetadata } from "@/components/address-picker";
import { ShoppingAddressPrompt } from "@/components/shopping-address-prompt";
import { CustomerError, customerRequest } from "@/lib/customer";
import { useI18n } from "@/i18n/provider";
import { loadCheckoutDraft } from "@/lib/checkout-draft";
import { emptyAddress, deliveryAddressLabel, DUSHANBE_BOUNDS, fetchSavedDeliveryAddresses, isWithinDeliveryBounds, loadGuestDeliveryAddress, loadGuestAddressList, saveGuestAddressList, parseDeliveryAddress, prepareDeliveryAddressStorage, saveGuestDeliveryAddress, updateCheckoutDraftAddress } from "@/lib/delivery-address";
import { useCustomer } from "./customer-context";

type Selection = { address: AddressInput; revision: number; explicit: boolean };
type SavedStatus = "loading" | "ready" | "unavailable";
type DeliveryAddressContextValue = {
  selection: Selection | null;
  selectedAddress: AddressInput | null;
  addressLabel: string;
  ready: boolean;
  savedAddresses: SavedAddress[];
  savedStatus: SavedStatus;
  openAddress: (initial?: AddressInput) => void;
  refreshAddresses: () => Promise<void>;
};
const Context = createContext<DeliveryAddressContextValue | null>(null);
const noAddresses: SavedAddress[] = [];

// Nullable to keep checkout usable until the root provider is integrated.
export function useDeliveryAddress() { return useContext(Context); }

export function DeliveryAddressProvider({ children }: { children: ReactNode }) {
  const customer = useCustomer();
  const owner = customer.loading ? "pending" : customer.user?.id ?? "guest";
  const [state, setState] = useState<{ owner: string; selection: Selection | null; addresses: SavedAddress[]; status: SavedStatus }>({ owner: "pending", selection: null, addresses: [], status: "loading" });
  const previousState = useRef(state); previousState.current = state;
  const [modal, setModal] = useState<{ owner: string; initial: AddressInput; editingId?: string; startWithNew?: boolean } | null>(null);
  const revision = useRef(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const ownerRef = useRef(owner); ownerRef.current = owner;
  const ready = owner !== "pending" && state.owner === owner;
  const selection = ready ? state.selection : null;

  useEffect(() => {
    if (owner === "pending") return;
    const account = owner !== "guest";
    let initial: AddressInput | null = null;
    let guest: AddressInput | null = account && previousState.current.owner === "guest" ? previousState.current.selection?.address ?? null : null;
    try {
      prepareDeliveryAddressStorage(window.sessionStorage, account ? owner : null);
      guest = loadGuestDeliveryAddress(window.sessionStorage) ?? guest;
      const draft = loadCheckoutDraft(window.sessionStorage);
      initial = parseDeliveryAddress(draft?.address) ?? guest;
    } catch { /* Storage may be unavailable. */ }
    initial ??= guest;
    setModal(null); setSaving(false); setSaveError("");
    let guestAddresses: SavedAddress[] = [];
    if (!account) try { guestAddresses = loadGuestAddressList(window.sessionStorage); } catch { /* Storage is optional. */ }
    if (!account && !guestAddresses.length && guest) guestAddresses = [{ ...guest, id: "guest-current", label: "home", isDefault: true }];
    setState({ owner, selection: initial ? { address: initial, revision: revision.current, explicit: false } : null, addresses: guestAddresses, status: account ? "loading" : "ready" });
    if (!account) return;
    const controller = new AbortController();
    void fetchSavedDeliveryAddresses(controller.signal).then(async existing => {
      let addresses = existing;
      if (guest && !controller.signal.aborted && ownerRef.current === owner) {
        addresses = await customerRequest<SavedAddress[]>("customer/addresses", "POST", { ...guest, label: "home", isDefault: !existing.length });
        if (!controller.signal.aborted && ownerRef.current === owner) try { window.sessionStorage.removeItem("df.delivery.address.v1"); } catch { /* Exact server deduplication makes a later retry safe. */ }
      }
      if (controller.signal.aborted) return;
      setState(current => {
        if (current.owner !== owner) return current;
        const fallback = addresses.find(address => address.isDefault && isWithinDeliveryBounds(address, DUSHANBE_BOUNDS));
        return { ...current, addresses, status: "ready", selection: current.selection ?? (fallback ? { address: parseDeliveryAddress(fallback)!, revision: revision.current, explicit: false } : null) };
      });
    }).catch(() => {
      if (!controller.signal.aborted) setState(current => current.owner === owner ? { ...current, status: "unavailable" } : current);
    });
    return () => controller.abort();
  }, [owner]);

  const openAddress = useCallback((initial?: AddressInput) => {
    if (!ready) return;
    let draft: AddressInput | null = null;
    try { draft = parseDeliveryAddress(loadCheckoutDraft(window.sessionStorage)?.address, false); } catch { /* Storage is optional. */ }
    const saved = initial && state.addresses.find(item => JSON.stringify(parseDeliveryAddress(item)) === JSON.stringify(parseDeliveryAddress(initial)));
    setModal({ owner, initial: initial ?? draft ?? selection?.address ?? { ...emptyAddress }, editingId: saved?.id, startWithNew: !!initial && !saved });
  }, [owner, ready, selection, state.addresses]);

  const refreshAddresses = useCallback(async () => {
    if (owner === "guest" || owner === "pending") return;
    const addresses = await fetchSavedDeliveryAddresses(new AbortController().signal);
    if (ownerRef.current !== owner) return;
    setState(current => {
      if (current.owner !== owner) return current;
      const selected = current.selection?.address;
      const previous = selected && current.addresses.find(item => JSON.stringify(parseDeliveryAddress(item)) === JSON.stringify(selected));
      if (!previous) return { ...current, addresses, status: "ready" };
      const replacement = addresses.find(item => item.id === previous.id) ?? addresses.find(item => item.isDefault);
      revision.current++;
      return { ...current, addresses, status: "ready", selection: replacement ? { address: parseDeliveryAddress(replacement)!, revision: revision.current, explicit: true } : null };
    });
  }, [owner]);

  function selectAddress(address: AddressInput) {
    const value = parseDeliveryAddress(address);
    if (!value) return;
    revision.current++;
    setState(current => ({ ...current, selection: { address: value, revision: revision.current, explicit: true } }));
    try { if (owner === "guest") saveGuestDeliveryAddress(window.sessionStorage, value); updateCheckoutDraftAddress(window.sessionStorage, value); } catch { /* Storage is optional. */ }
    setModal(null);
  }

  async function confirm(address: AddressInput, metadata: AddressMetadata) {
    if (!ready || modal?.owner !== owner) return;
    const value = parseDeliveryAddress(address);
    if (!value) return;
    if (owner === "guest" && !metadata.id && state.addresses.length >= 20) { setSaveError("Можно сохранить не больше 20 адресов."); return; }
    setSaveError(""); setSaving(true);
    const targetOwner = owner;
    try {
      const id = metadata.id ?? `guest-${crypto.randomUUID()}`;
      const addresses: SavedAddress[] = owner === "guest" ? [
        ...state.addresses.filter(item => item.id !== metadata.id),
        { ...value, id, label: metadata.label, isDefault: metadata.isDefault ?? !state.addresses.length }
      ] : await customerRequest<SavedAddress[]>(`customer/addresses${metadata.id ? `/${metadata.id}` : ""}`, metadata.id ? "PATCH" : "POST", { ...value, label: metadata.label, isDefault: metadata.isDefault ?? !state.addresses.length });
      if (ownerRef.current !== targetOwner) return;
      setState(current => current.owner === targetOwner ? { ...current, addresses } : current);
      if (owner === "guest") try { saveGuestAddressList(window.sessionStorage, addresses); } catch { /* Storage is optional. */ }
    } catch (error) {
      if (ownerRef.current === targetOwner) {
        setSaveError("Не удалось сохранить адрес. Повторите попытку.");
        if (error instanceof CustomerError && error.status === 401) void customer.refresh();
      }
      return;
    } finally { if (ownerRef.current === targetOwner) setSaving(false); }
    selectAddress(value);
  }

  async function deleteAddress(id: string) {
    if (!ready || modal?.owner !== owner) return;
    setSaving(true); setSaveError(""); const targetOwner = owner;
    try {
      const removed = state.addresses.find(item => item.id === id);
      const addresses = owner === "guest" ? state.addresses.filter(item => item.id !== id) : await customerRequest<SavedAddress[]>(`customer/addresses/${id}`, "DELETE");
      if (ownerRef.current !== targetOwner) return;
      setState(current => ({ ...current, addresses }));
      if (owner === "guest") saveGuestAddressList(window.sessionStorage, addresses);
      if (removed && JSON.stringify(parseDeliveryAddress(removed)) === JSON.stringify(parseDeliveryAddress(selection?.address))) {
        revision.current++;
        setState(current => ({ ...current, selection: null }));
        try { window.sessionStorage.removeItem("df.delivery.address.v1"); updateCheckoutDraftAddress(window.sessionStorage, emptyAddress); } catch { /* Storage is optional. */ }
      }
      setModal(null);
    } catch { if (ownerRef.current === targetOwner) setSaveError("Не удалось сохранить адрес. Повторите попытку."); }
    finally { if (ownerRef.current === targetOwner) setSaving(false); }
  }

  const addresses = ready ? state.addresses : noAddresses;
  return <Context.Provider value={{ selection, selectedAddress: selection?.address ?? null, addressLabel: deliveryAddressLabel(selection?.address ?? null),
    ready, savedAddresses: addresses, savedStatus: ready ? state.status : "loading", openAddress, refreshAddresses }}>
    {children}
    <ShoppingAddressPrompt />
    {ready && modal?.owner === owner ? <AddressPicker key={`${owner}-${modal.editingId ?? "select"}`} initial={modal.initial} addresses={addresses} initialEditingId={modal.editingId} startWithNew={modal.startWithNew} busy={saving} error={saveError} onClose={() => { setModal(null); setSaveError(""); }} onSave={confirm} onSelect={selectAddress} onDelete={deleteAddress} /> : null}
  </Context.Provider>;
}
// Optional drop-in header control; no header/layout edits are required by this module.
export function DeliveryAddressTrigger({ className = "", eyebrow = "Душанбе", brandMark = false }: { className?: string; eyebrow?: string; brandMark?: boolean }) {
  const delivery = useDeliveryAddress();
  const { t } = useI18n();
  if (!delivery) return null;
  const label = delivery.addressLabel || t("Указать адрес доставки");
  return <button type="button" className={`delivery-address-trigger ${className}`} disabled={!delivery.ready}
    aria-haspopup="dialog" aria-label={`${t("Адрес доставки")}: ${label}`} title={label} onClick={event => { event.currentTarget.focus({ preventScroll: true }); delivery.openAddress(); }}>
    {brandMark ? <Image className="delivery-address-trigger__brand" src="/brand/wordmark-v3.webp" width={108} height={38} alt="Dushanbe Fresh" priority /> : <MapPin size={18} aria-hidden="true" />}
    <span className="delivery-address-trigger__text">{eyebrow ? <span className="delivery-address-trigger__city">{t(eyebrow)}</span> : null}<span className="delivery-address-trigger__address">{label}</span></span><ChevronDown size={16} aria-hidden="true" />
  </button>;
}
