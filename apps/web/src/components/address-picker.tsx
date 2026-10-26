"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Bookmark, BriefcaseBusiness, Check, ChevronRight, Home, LoaderCircle, MapPin, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { checkDeliveryZone, deliveryZoneMessages } from "@dushanbe-fresh/shared";
import type { AddressInput, SavedAddress } from "@dushanbe-fresh/shared";
import { useI18n } from "@/i18n/provider";
import { ADDRESS_QUERY_MIN, ADDRESS_QUERY_MAX, ADDRESS_SEARCH_LIMIT, deliveryAddressLabel, DUSHANBE_BOUNDS, WORLD_BOUNDS, emptyAddress, isWithinDeliveryBounds, parseAddressSuggestion, parseCityBounds, parseDeliveryAddress, type AddressSuggestion, type CityBounds } from "@/lib/delivery-address";
import { AddressMapCanvas, type DeliveryPoint } from "./address-map-canvas";
import { CustomerDialog } from "./customer-dialog";
import { useReverseAddress } from "./use-reverse-address";
import { useDeliveryGeolocation } from "./use-delivery-geolocation";
import { useDeliveryZone } from "./use-delivery-zone";

export type AddressMetadata = { id?: string; label: SavedAddress["label"]; isDefault?: boolean };
const labels = [{ value: "home", text: "Дом", Icon: Home }, { value: "work", text: "Работа", Icon: BriefcaseBusiness }, { value: "other", text: "Другое", Icon: Bookmark }] as const;

export function AddressPicker({ initial, addresses, initialEditingId, startWithNew = false, busy, error, onClose, onSave, onSelect, onDelete }: {
  initial: AddressInput; addresses: SavedAddress[]; initialEditingId?: string; startWithNew?: boolean; busy: boolean; error: string;
  onClose: () => void; onSave: (address: AddressInput, metadata: AddressMetadata) => void;
  onSelect: (address: SavedAddress) => void; onDelete: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const [view, setView] = useState<"saved" | "map" | "details">(initialEditingId ? "details" : addresses.length && !startWithNew ? "saved" : "map");
  const [address, setAddress] = useState(initial);
  const [metadata, setMetadata] = useState<AddressMetadata>({ id: initialEditingId, label: addresses.find(item => item.id === initialEditingId)?.label ?? "home" });
  const [query, setQuery] = useState(deliveryAddressLabel(initial));
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [source, setSource] = useState<"search" | "map" | "manual">("manual");
  const [moving, setMoving] = useState(false);
  const [config, setConfig] = useState<{ available: boolean; bounds: CityBounds; geoapify?: boolean }>({ available: false, bounds: DUSHANBE_BOUNDS });
  const [search, setSearch] = useState<{ status: "idle" | "loading" | "ready" | "error"; items: AddressSuggestion[] }>({ status: "idle", items: [] });
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const delivery = useDeliveryZone();
  const reverse = useReverseAddress(address, WORLD_BOUNDS, view === "map" && source === "map" && !moving);
  const gps = useDeliveryGeolocation(changePoint, WORLD_BOUNDS);
  const cancelLocation = gps.cancel;
  useEffect(() => { if (view !== "map") cancelLocation(); }, [view, cancelLocation]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    void fetch("/api/address-search", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) return;
      const data = await response.json(), bounds = parseCityBounds(data?.bounds);
      if (bounds && data.city === "Dushanbe") setConfig({ available: data.status === "configured", bounds, geoapify: data.provider === "geoapify" });
    }).catch(() => {}).finally(() => clearTimeout(timer));
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (view !== "map" || !dirty || query.trim().length < ADDRESS_QUERY_MIN) { setSearch({ status: "idle", items: [] }); return; }
    if (!config.available) { setSearch({ status: "error", items: [] }); return; }
    const controller = new AbortController(); let valid = true;
    setSearch({ status: "loading", items: [] }); setActive(-1);
    const timer = setTimeout(() => {
      void fetch("/api/address-search", { method: "POST", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: query.trim(), language: locale }) }).then(async response => {
        if (!response.ok) throw new Error("Unavailable");
        const data = await response.json();
        if (data.status !== "available" || !Array.isArray(data.items)) throw new Error("Unavailable");
        const items = data.items.slice(0, ADDRESS_SEARCH_LIMIT).map(parseAddressSuggestion)
          .filter((item: AddressSuggestion | null): item is AddressSuggestion => !!item && isWithinDeliveryBounds(item, config.bounds));
        if (valid) setSearch({ status: "ready", items });
      }).catch(() => { if (valid) setSearch({ status: "error", items: [] }); });
    }, 350);
    const deadline = setTimeout(() => controller.abort(), 6500);
    return () => { valid = false; controller.abort(); clearTimeout(timer); clearTimeout(deadline); };
  }, [query, dirty, config, locale, view]);

  useEffect(() => {
    if (reverse?.status !== "available" || !reverse.address) return;
    const result = reverse.address;
    setAddress(current => ({ ...current, street: result.street, building: result.building }));
    setQuery(deliveryAddressLabel(result)); setDirty(false);
  }, [reverse]);

  function choose(item: AddressSuggestion) {
    cancelLocation();
    setAddress(current => ({ ...current, street: item.street, building: item.building, latitude: item.latitude, longitude: item.longitude }));
    setQuery(deliveryAddressLabel(item)); setDirty(false); setOpen(false); setSource("search"); input.current?.blur();
  }
  function changePoint(point: DeliveryPoint) {
    setAddress(current => ({ ...current, ...point, street: "", building: "" })); setSource("map"); setQuery(""); setDirty(false); setOpen(false); input.current?.blur();
  }
  function edit(item: SavedAddress) { setAddress(item); setMetadata({ id: item.id, label: item.label, isDefault: item.isDefault }); setView("details"); }
  function add() { setAddress({ ...emptyAddress }); setMetadata({ label: "home" }); setQuery(""); setDirty(false); setSource("manual"); setView("map"); }
  const zoneResult = delivery.zone ? checkDeliveryZone(delivery.zone, address) : null;
  const validPoint = delivery.status === "ready" && zoneResult === "allowed";
  const zoneError = delivery.status === "unavailable" ? deliveryZoneMessages.unavailable : zoneResult && zoneResult !== "allowed" ? deliveryZoneMessages[zoneResult] : "";
  const zoneNotice = <>{zoneError ? <p className="address-zone-error" role="alert">{t(zoneError)}{delivery.status === "unavailable" ? <button type="button" className="catalog-icon-action" title={t("Повторить")} aria-label={t("Повторить")} onClick={delivery.refresh}><RefreshCw size={18} /></button> : null}</p> : null}</>;
  const showResults = open && dirty && query.trim().length >= ADDRESS_QUERY_MIN;
  const title = view === "saved" ? "Выберите адрес" : view === "details" ? metadata.id ? "Изменить адрес" : "Детали адреса" : "Куда доставить?";

  return <CustomerDialog title={t(title)} busy={busy} onClose={onClose} focusTitleOnMobile className={`address-picker address-picker--${view}`}>
    {view === "saved" ? <div className="address-book">
      <button className="address-book__row" type="button" onClick={add}><Plus size={22} /><span>{t("Добавить новый адрес")}</span><ChevronRight size={18} /></button>
      {addresses.map(item => {
        const Icon = labels.find(label => label.value === item.label)?.Icon ?? Bookmark;
        return <div className="address-book__item" key={item.id}>
          <button className="address-book__row" type="button" disabled={busy || delivery.status !== "ready"} onClick={() => {
            if (delivery.zone && checkDeliveryZone(delivery.zone, item) === "allowed") onSelect(item);
            else { edit(item); setQuery(deliveryAddressLabel(item)); setDirty(false); setView("map"); }
          }}><Icon size={21} /><span><strong>{t(labels.find(label => label.value === item.label)?.text ?? "Другое")}</strong><small>{deliveryAddressLabel(item)}{item.apartment ? `, ${t("Квартира")} ${item.apartment}` : ""}</small></span></button>
          <button className="address-book__edit" type="button" title={t("Изменить адрес")} aria-label={`${t("Изменить адрес")}: ${deliveryAddressLabel(item)}`} onClick={() => edit(item)}><Pencil size={18} /></button>
        </div>;
      })}
      {error ? <p role="alert" className="checkout-error">{t(error)}</p> : null}
      {delivery.status === "unavailable" ? zoneNotice : null}
    </div> : view === "map" ? <div className="address-picker__selection">
      <div className="address-search-bar">
        {addresses.length ? <button type="button" className="address-picker__back" title={t("Мои адреса")} aria-label={t("Мои адреса")} onClick={() => setView("saved")}><ArrowLeft size={20} /></button> : <Search size={21} aria-hidden="true" />}
        <input ref={input} role="combobox" aria-label={t("Поиск адреса в Душанбе")} aria-controls={listId} aria-expanded={showResults} aria-autocomplete="list"
          aria-activedescendant={active >= 0 && showResults ? `${listId}-${active}` : undefined} autoComplete="off" maxLength={ADDRESS_QUERY_MAX}
          placeholder={t("Улица и номер дома")} value={query} onFocus={() => setOpen(true)}
          onChange={event => { cancelLocation(); setQuery(event.target.value); setSource("manual"); setDirty(true); setOpen(true); }}
          onKeyDown={event => {
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive(index => search.items.length ? (index + (event.key === "ArrowDown" ? 1 : -1) + search.items.length) % search.items.length : -1); }
            if (event.key === "Enter" && active >= 0 && search.items[active]) { event.preventDefault(); choose(search.items[active]); }
          }} />
        {search.status === "loading" && dirty ? <LoaderCircle className="address-search-spinner" size={19} aria-label={t("Ищем адрес...")} /> : query ? <button type="button" title={t("Очистить поиск")} aria-label={t("Очистить поиск")} onClick={() => { cancelLocation(); setQuery(""); setSource("manual"); setDirty(true); input.current?.focus(); }}><X size={19} /></button> : null}
        {showResults ? <div className="address-suggestions" id={listId} role="listbox" aria-label={t("Адреса в Душанбе")}>
          {search.items.map((item, index) => <button key={`${item.street}-${item.building}-${index}`} id={`${listId}-${index}`} type="button" role="option" aria-selected={active === index}
            onMouseDown={event => event.preventDefault()} onClick={() => choose(item)}><MapPin size={18} /><span><strong>{deliveryAddressLabel(item)}</strong><small>{item.description || t("Душанбе")}</small></span>{active === index ? <Check size={17} /> : null}</button>)}
          {!search.items.length ? <p role="status">{t(search.status === "loading" ? "Ищем адрес..." : "Не нашли адрес? Уточните его вручную.")}</p> : null}
          {config.geoapify && search.items.length ? <small className="address-suggestions__credit"><a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a></small> : null}
        </div> : null}
      </div>
      <AddressMapCanvas point={address} zone={delivery.zone} onChange={changePoint} onMoving={setMoving} onLocate={gps.locate} onInteraction={cancelLocation} locating={gps.locating} locationError={gps.error} />
      <footer className="address-picker__footer">
        {delivery.zone?.enabled && !moving && address.latitude != null ? <p className={`address-zone-status${zoneResult === "outside" ? " is-outside" : ""}`} data-testid="delivery-zone-status">{zoneResult === "allowed" ? <Check size={16} /> : <MapPin size={16} />}{t(zoneResult === "allowed" ? "Сюда доставляем" : "За зоной доставки")}</p> : null}
        <div className="address-picker__selected"><MapPin size={20} /><span><strong>{dirty ? query || t("Выберите точку на карте") : moving ? t("Выберите точку на карте") : deliveryAddressLabel(address) || t("Уточните улицу и номер дома")}</strong>{isWithinDeliveryBounds(address, DUSHANBE_BOUNDS) ? <small>{t("Душанбе")}</small> : null}</span>
          {reverse?.status === "searching" ? <LoaderCircle size={18} className="address-search-spinner" aria-label={t("Определяем адрес точки...")} /> : null}</div>
        {zoneNotice}
        <button type="button" className="primary-action" data-testid="address-continue" disabled={moving || !validPoint} onClick={() => {
          if (dirty) setAddress(current => ({ ...current, street: query.trim(), building: "" }));
          setView("details"); setOpen(false);
        }}>{t(!dirty && address.street && address.building ? "Подтвердить адрес" : "Уточнить адрес")}</button>
      </footer>
    </div> : <form className="address-details" onSubmit={event => { event.preventDefault(); const parsed = parseDeliveryAddress(address); if (parsed && validPoint) onSave(parsed, metadata); }}>
      <button className="address-details__location" type="button" onClick={() => { setQuery(deliveryAddressLabel(address)); setDirty(false); setView("map"); }}><MapPin size={19} /><span>{deliveryAddressLabel(address) || t("Выбрать на карте")}</span><ChevronRight size={18} /></button>
      <fieldset disabled={busy}>
        <div className="address-labels" role="group" aria-label={t("Тип адреса")}>{labels.map(({ value, text, Icon }) => <label key={value}><input type="radio" name={`${listId}-label`} checked={metadata.label === value} onChange={() => setMetadata(current => ({ ...current, label: value }))} /><span><Icon size={17} />{t(text)}</span></label>)}</div>
        <div className="address-detail-row address-detail-row--street">
          <label>{t("Улица")}<input required autoComplete="address-line1" maxLength={150} value={address.street} onChange={event => setAddress(current => ({ ...current, street: event.target.value }))} /></label>
          <label>{t("Дом")}<input required autoComplete="address-line2" maxLength={30} value={address.building} onChange={event => setAddress(current => ({ ...current, building: event.target.value }))} /></label>
        </div>
        <div className="address-housing" role="group" aria-label={t("Тип жилья")}>{(["apartment", "house"] as const).map(type => <label key={type}><input type="radio" name={`${listId}-housing`} checked={(address.housingType ?? "apartment") === type} onChange={() => setAddress(current => ({ ...current, housingType: type, ...(type === "house" ? { apartment: "", entrance: "", floor: "" } : {}) }))} /><span>{t(type === "house" ? "Частный дом" : "Квартира")}</span></label>)}</div>
        {address.housingType !== "house" ? <div className="address-detail-row">{([['apartment', 'Квартира'], ['intercom', 'Домофон'], ['entrance', 'Подъезд'], ['floor', 'Этаж']] as const).map(([key, label]) => <label key={key}>{t(label)}<input aria-label={t(key === "apartment" ? "Номер квартиры" : label)} maxLength={30} value={address[key] ?? ""} onChange={event => setAddress(current => ({ ...current, [key]: event.target.value }))} /></label>)}</div> : null}
        <label className="address-detail-comment">{t(address.housingType === "house" ? "Ориентир и комментарий курьеру" : "Комментарий курьеру")}<textarea rows={2} maxLength={500} value={address.instructions} onChange={event => setAddress(current => ({ ...current, instructions: event.target.value }))} /></label>
      </fieldset>
      {error ? <p role="alert" className="checkout-error">{t(error)}</p> : null}
      {zoneNotice}
      <footer className="address-picker__footer address-details__footer">{metadata.id ? <button className="address-delete" type="button" disabled={busy} onClick={() => onDelete(metadata.id!)}><Trash2 size={18} />{t("Удалить")}</button> : null}
        <button className="primary-action" type="submit" disabled={busy || !parseDeliveryAddress(address) || !validPoint}>{t(busy ? "Сохраняем..." : "Сохранить адрес")}</button></footer>
    </form>}
  </CustomerDialog>;
}
