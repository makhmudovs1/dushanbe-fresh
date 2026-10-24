"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { ArrowLeft, ChevronDown, ChevronRight, MapPin, PencilLine, Search } from "lucide-react";
import type { AddressInput, SavedAddress } from "@dushanbe-fresh/shared";
import { AddressFields, AddressMap, emptyAddress } from "@/components/address-fields";
import { CustomerDialog } from "@/components/customer-dialog";
import { ShoppingAddressPrompt } from "@/components/shopping-address-prompt";
import { CustomerError, customerRequest } from "@/lib/customer";
import { useI18n } from "@/i18n/provider";
import { loadCheckoutDraft } from "@/lib/checkout-draft";
import { ADDRESS_QUERY_MAX, ADDRESS_QUERY_MIN, ADDRESS_SEARCH_LIMIT, deliveryAddressLabel, DUSHANBE_BOUNDS, fetchSavedDeliveryAddresses, filterSavedAddresses, isWithinDeliveryBounds, loadGuestDeliveryAddress, parseCityBounds, parseDeliveryAddress, prepareDeliveryAddressStorage, saveGuestDeliveryAddress, updateCheckoutDraftAddress, type CityBounds } from "@/lib/delivery-address";
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
  const [modal, setModal] = useState<{ owner: string; initial: AddressInput } | null>(null);
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
    setState({ owner, selection: initial ? { address: initial, revision: revision.current, explicit: false } : null, addresses: [], status: account ? "loading" : "ready" });
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
    setModal({ owner, initial: initial ?? draft ?? selection?.address ?? { ...emptyAddress } });
  }, [owner, ready, selection]);

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

  async function confirm(address: AddressInput) {
    if (!ready || modal?.owner !== owner) return;
    const value = parseDeliveryAddress(address);
    if (!value) return;
    setSaveError(""); setSaving(true);
    const targetOwner = owner;
    try {
      const addresses = owner === "guest" ? state.addresses : await customerRequest<SavedAddress[]>("customer/addresses", "POST", { ...value, label: "home", isDefault: !state.addresses.length });
      if (ownerRef.current !== targetOwner) return;
      setState(current => current.owner === targetOwner ? { ...current, addresses } : current);
    } catch (error) {
      if (ownerRef.current === targetOwner) {
        setSaveError("Не удалось сохранить адрес. Повторите попытку.");
        if (error instanceof CustomerError && error.status === 401) void customer.refresh();
      }
      return;
    } finally { if (ownerRef.current === targetOwner) setSaving(false); }
    revision.current += 1;
    setState(current => ({ ...current, selection: { address: value, revision: revision.current, explicit: true } }));
    try {
      if (owner === "guest") saveGuestDeliveryAddress(window.sessionStorage, value);
      updateCheckoutDraftAddress(window.sessionStorage, value);
    } catch { /* Selection remains available in memory. */ }
    setModal(null);
  }

  const addresses = ready ? state.addresses : noAddresses;
  return <Context.Provider value={{ selection, selectedAddress: selection?.address ?? null, addressLabel: deliveryAddressLabel(selection?.address ?? null),
    ready, savedAddresses: addresses, savedStatus: ready ? state.status : "loading", openAddress, refreshAddresses }}>
    {children}
    <ShoppingAddressPrompt />
    {ready && modal?.owner === owner ? <DeliveryAddressModal key={owner} initial={modal.initial} addresses={addresses} savedStatus={state.status} saving={saving} saveError={saveError} onClose={() => { setModal(null); setSaveError(""); }} onConfirm={confirm} /> : null}
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
    {brandMark ? <Image className="delivery-address-trigger__brand" src="/brand/mark-v3.webp" width={36} height={36} alt="" /> : <MapPin size={18} aria-hidden="true" />}
    <span className="delivery-address-trigger__text">{eyebrow ? <span className="delivery-address-trigger__city">{t(eyebrow)}</span> : null}<span className="delivery-address-trigger__address">{label}</span></span><ChevronDown size={16} aria-hidden="true" />
  </button>;
}

type SearchStatus = "checking" | "configured" | "searching" | "available" | "unavailable";
type MobileStage = "choose" | "map" | "street" | "details";
function DeliveryAddressModal({ initial, addresses, savedStatus, onClose, onConfirm, saving, saveError }: {
  initial: AddressInput; addresses: SavedAddress[]; savedStatus: SavedStatus; onClose: () => void; onConfirm: (address: AddressInput) => void;
  saving: boolean; saveError: string;
}) {
  const { t } = useI18n();
  const statusId = useId();
  const [address, setAddress] = useState(initial);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<MobileStage>("choose");
  const [mapReturnStage, setMapReturnStage] = useState<MobileStage>("choose");
  const mobileBody = useRef<HTMLFormElement>(null);
  const [config, setConfig] = useState<{ configured: boolean; bounds: CityBounds } | null>(null);
  const [search, setSearch] = useState<{ query: string; status: SearchStatus; items: AddressInput[] }>({ query: "", status: "checking", items: [] });
  const bounds = config?.bounds ?? DUSHANBE_BOUNDS;
  const validPoint = isWithinDeliveryBounds(address, bounds);
  const localMatches = filterSavedAddresses(addresses, query);
  const normalizedQuery = query.trim();
  const remoteItems = search.query === normalizedQuery ? search.items : [];

  useEffect(() => {
    const form = mobileBody.current;
    form?.closest(".catalog-dialog__body")?.scrollTo(0, 0);
    if (stage === "choose") {
      const target = matchMedia("(max-width: 1023px)").matches
        ? form?.closest("dialog")?.querySelector<HTMLElement>(".catalog-dialog__header h2")
        : form?.querySelector<HTMLInputElement>("input[type=search]");
      target?.focus({ preventScroll: true });
    }
    else form?.querySelector<HTMLElement>("[data-stage-heading]")?.focus({ preventScroll: true });
  }, [stage]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    let active = true;
    void fetch("/api/address-search", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Unavailable");
      const value: unknown = await response.json();
      const data = value as { status?: string; bounds?: unknown; city?: string } | null;
      const cityBounds = parseCityBounds(data?.bounds);
      if (!cityBounds || data?.city !== "Dushanbe" || !["configured", "unavailable"].includes(data.status ?? "")) throw new Error("Unavailable");
      if (active) setConfig({ configured: data.status === "configured", bounds: cityBounds });
    }).catch(() => { if (active) setConfig({ configured: false, bounds: DUSHANBE_BOUNDS }); })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, []);

  useEffect(() => {
    if (!config) return;
    if (!config.configured) { setSearch({ query: normalizedQuery, status: "unavailable", items: [] }); return; }
    if (normalizedQuery.length < ADDRESS_QUERY_MIN) { setSearch({ query: normalizedQuery, status: "configured", items: [] }); return; }
    const controller = new AbortController();
    let active = true;
    setSearch({ query: normalizedQuery, status: "searching", items: [] });
    const timer = setTimeout(() => {
      void fetch("/api/address-search", { method: "POST", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: normalizedQuery }) }).then(async response => {
        if (!response.ok) throw new Error("Unavailable");
        const data = await response.json();
        if (data?.status !== "available" || !Array.isArray(data.items)) throw new Error("Unavailable");
        const items = data.items.slice(0, ADDRESS_SEARCH_LIMIT).map((item: unknown) => parseDeliveryAddress(item, false))
          .filter((item: AddressInput | null): item is AddressInput => !!item && isWithinDeliveryBounds(item, config.bounds));
        if (active) setSearch({ query: normalizedQuery, status: "available", items });
      }).catch(() => { if (active) setSearch({ query: normalizedQuery, status: "unavailable", items: [] }); });
    }, 350);
    const deadline = setTimeout(() => controller.abort(), 6500);
    return () => { active = false; clearTimeout(timer); clearTimeout(deadline); controller.abort(); };
  }, [normalizedQuery, config]);

  const status = !config ? "checking" : !config.configured ? "unavailable" : search.query === normalizedQuery ? search.status : "searching";
  const statusLabel = t(status === "checking" ? "Проверяем доступность поиска..." : status === "unavailable" ? "Поиск по городу пока недоступен" : status === "searching" ? "Ищем адрес..." : status === "configured" ? "Поиск по городу подключён" : remoteItems.length ? "Адреса в Душанбе" : "Адреса не найдены");

  function chooseAddress(value: AddressInput) {
    setAddress(value);
    setStage(parseDeliveryAddress(value) ? "details" : "street");
  }

  function chooseMap() {
    setMapReturnStage(stage);
    setStage("map");
  }

  return <CustomerDialog title={t("Адрес доставки")} busy={saving} onClose={onClose} className="customer-address-flow" focusTitleOnMobile>
    <form ref={mobileBody} className="delivery-address-form" data-address-stage={stage} onSubmit={event => {
      event.preventDefault();
      const value = parseDeliveryAddress(address);
      if (stage === "street" && value) setStage("details");
      else if (stage === "details" && value && config && validPoint) onConfirm(value);
    }}>
      {stage !== "choose" ? <div className="delivery-address-mobile__step">
        <button type="button" className="catalog-icon-action" data-testid="address-back" aria-label={t("Назад")} title={t("Назад")}
          onClick={() => setStage(stage === "map" ? mapReturnStage : stage === "details" ? "street" : "choose")}><ArrowLeft size={20} aria-hidden="true" /></button>
        <h3 tabIndex={-1} data-stage-heading>{t(stage === "map" ? "Точка доставки на карте" : stage === "street" ? "Адрес вручную" : "Детали адреса")}</h3>
      </div> : null}
      {stage === "choose" ? <>
        <label className="field delivery-address-search"><span className="delivery-address-mobile__sr-label">{t("Поиск адреса в Душанбе")}</span>
          <span><Search size={20} aria-hidden="true" /><input type="search" autoComplete="off" placeholder={t("Поиск адреса в Душанбе")}
            maxLength={ADDRESS_QUERY_MAX} value={query} aria-describedby={statusId} onChange={event => setQuery(event.target.value)} /></span>
        </label>
        <p className="delivery-address-status" id={statusId} role="status">{statusLabel}</p>
        <button type="button" className="delivery-address-mobile__option" data-testid="address-choose-map" onClick={chooseMap}>
          <span className="delivery-address-mobile__option-icon"><MapPin size={22} aria-hidden="true" /></span><span>{t("Выбрать на карте")}</span><ChevronRight size={18} aria-hidden="true" />
        </button>
        {savedStatus === "loading" ? <p className="delivery-address-status" role="status">{t("Загружаем сохранённые адреса...")}</p> : null}
        {savedStatus === "unavailable" ? <p className="delivery-address-status" role="status">{t("Не удалось загрузить сохранённые адреса")}</p> : null}
        {addresses.length ? <section className="delivery-address-results" aria-label={t("Сохранённые адреса")}>
          <h3>{t("Сохранённые адреса")}</h3>
          {localMatches.length ? <ul>{localMatches.map(saved => <li key={saved.id}><button type="button" data-address-id={saved.id} onClick={() => chooseAddress(parseDeliveryAddress(saved)!)}>
            <MapPin size={20} aria-hidden="true" /><span>{deliveryAddressLabel(saved)}{saved.apartment ? <small>{t("Квартира")} {saved.apartment}</small> : null}</span><ChevronRight size={18} aria-hidden="true" />
          </button></li>)}</ul> : <p className="delivery-address-status">{t("Сохранённые адреса не найдены")}</p>}
        </section> : null}
        {remoteItems.length ? <section className="delivery-address-results" aria-label={t("Адреса в Душанбе")}>
          <h3>{t("Адреса в Душанбе")}</h3><ul>{remoteItems.map((item, index) => <li key={index}><button type="button" onClick={() => chooseAddress(item)}>
            <MapPin size={20} aria-hidden="true" /><span>{deliveryAddressLabel(item)}</span><ChevronRight size={18} aria-hidden="true" />
          </button></li>)}</ul>
        </section> : null}
        <button type="button" className="delivery-address-mobile__option" data-testid="address-manual" onClick={() => {
          if (!address.street.trim() && normalizedQuery) setAddress(current => ({ ...current, street: normalizedQuery }));
          setStage("street");
        }}><span className="delivery-address-mobile__option-icon"><PencilLine size={20} aria-hidden="true" /></span><span>{t("Адрес вручную")}</span><ChevronRight size={18} aria-hidden="true" /></button>
        <p className="delivery-address-city"><MapPin size={16} aria-hidden="true" />{t("Доставка только по Душанбе")}</p>
      </> : null}
      {stage === "map" ? <section className="delivery-address-mobile__map" aria-label={t("Точка доставки на карте")}>
        <AddressMap value={address} onChange={point => setAddress(current => ({ ...current, ...point }))} />
        {!validPoint ? <p className="checkout-error" role="alert">{t("Точка за пределами зоны выбора в Душанбе")}</p> : null}
        <footer className="delivery-address-footer">
          <button type="button" className="primary-action" data-testid="address-map-confirm" disabled={address.latitude == null || !validPoint}
            onClick={() => setStage(mapReturnStage === "details" ? "details" : "street")}>{t("Готово")}</button>
          <button type="button" className="secondary-link" onClick={() => setStage("street")}>{t("Адрес вручную")}</button>
        </footer>
      </section> : null}
      {stage === "street" || stage === "details" ? <>
        {stage === "street" ? <p className="delivery-address-city"><MapPin size={16} aria-hidden="true" />{t("Душанбе")}</p> : <div className="delivery-address-mobile__summary">
          <MapPin size={20} aria-hidden="true" /><span>{deliveryAddressLabel(address)}</span>
          <button type="button" className="catalog-icon-action" data-testid="address-edit-street" aria-label={t("Изменить адрес")} title={t("Изменить адрес")} onClick={() => setStage("street")}><PencilLine size={18} aria-hidden="true" /></button>
        </div>}
        <section className="delivery-address-manual" aria-label={t(stage === "street" ? "Адрес вручную" : "Детали адреса")}>
          <AddressFields value={address} onChange={setAddress} fields={stage} onChooseMap={chooseMap} />
          {!validPoint ? <p className="checkout-error" role="alert">{t("Точка за пределами зоны выбора в Душанбе")}</p> : null}
        </section>
        <footer className="delivery-address-footer"><button type="submit" className="primary-action" data-testid={stage === "street" ? "address-next" : "address-confirm"}
          disabled={saving || !parseDeliveryAddress(address) || (stage === "details" && (!config || !validPoint))}>{t(saving ? "Сохраняем..." : stage === "street" ? "Далее" : "Доставить сюда")}</button></footer>
      </> : null}
      {saveError ? <p className="checkout-error" role="alert">{t(saveError)}</p> : null}
    </form>
  </CustomerDialog>;
}
