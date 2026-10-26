"use client";
import { useId, useState } from "react";
import { MapPin, LocateFixed, X } from "lucide-react";
import type { AddressInput } from "@dushanbe-fresh/shared";
import { useI18n } from "@/i18n/provider";
import { WORLD_BOUNDS, type CityBounds } from "@/lib/delivery-address";
import { AddressPicker } from "./address-picker";
import { useDeliveryGeolocation } from "./use-delivery-geolocation";

export { emptyAddress } from "@/lib/delivery-address";


export function AddressFields({ value, onChange, fields = "all", onChooseMap, bounds = WORLD_BOUNDS }: {
  value: AddressInput; onChange: (address: AddressInput) => void;
  fields?: "all" | "street" | "details"; onChooseMap?: () => void; bounds?: CityBounds;
}) {
  const { t } = useI18n();
  const id = useId();
  const [open, setOpen] = useState(false);
  const gps = useDeliveryGeolocation(point => onChange({ ...value, ...point }), bounds);
  return <>
    {fields !== "street" ? <div className="housing-toggle" role="group" aria-label={t("Тип жилья")}>
      {(["apartment", "house"] as const).map(type => <label key={type}><input type="radio" name={`housing-${id}`} checked={(value.housingType ?? "apartment") === type} onChange={() => onChange({ ...value, housingType: type, ...(type === "house" ? { apartment: "", entrance: "", floor: "" } : {}) })} /><span>{t(type === "house" ? "Частный дом" : "Квартира")}</span></label>)}
    </div> : null}
    <div className="checkout-input-grid">
      {fields !== "details" ? <>
        <label className="field">{t("Улица")}<input autoComplete="address-line1" required maxLength={150} value={value.street} onChange={event => { gps.cancel(); onChange({ ...value, street: event.target.value }); }} /></label>
        <label className="field">{t("Дом")}<input autoComplete="address-line2" required maxLength={30} value={value.building} onChange={event => { gps.cancel(); onChange({ ...value, building: event.target.value }); }} /></label>
      </> : null}
      {fields !== "street" && value.housingType !== "house" ? ([['apartment', 'Квартира'], ['entrance', 'Подъезд'], ['floor', 'Этаж']] as const).map(([key, label]) => <label className="field" key={key}>{t(label)}<input maxLength={30} value={value[key]} onChange={event => onChange({ ...value, [key]: event.target.value })} /></label>) : null}
      {fields !== "street" ? <label className="field">{t("Домофон")}<input maxLength={30} value={value.intercom ?? ""} onChange={event => onChange({ ...value, intercom: event.target.value })} /></label> : null}
    </div>
    {fields !== "street" ? <>
    <label className="field">{t("Комментарий / ориентир")}<textarea aria-label={t("Комментарий / ориентир")} rows={2} maxLength={500} value={value.instructions} onChange={event => onChange({ ...value, instructions: event.target.value })} /></label>
    <div className="address-tools">
      <button className="secondary-link" type="button" onClick={() => onChooseMap ? onChooseMap() : setOpen(true)}><MapPin size={18} aria-hidden="true" />{t(value.latitude == null ? "Поставить точку на карте" : "Изменить точку на карте")}</button>
      <button className="secondary-link" type="button" disabled={gps.locating} onClick={gps.locate}><LocateFixed size={18} aria-hidden="true" />{t(gps.locating ? "Определяем..." : "Моё местоположение")}</button>
      {value.latitude != null ? <><small>{value.latitude.toFixed(5)}, {value.longitude?.toFixed(5)}</small><button className="catalog-icon-action" type="button" aria-label={t("Удалить точку")} title={t("Удалить точку")} onClick={() => { gps.cancel(); onChange({ ...value, latitude: null, longitude: null }); }}><X size={18} /></button></> : null}
    </div>
    {gps.error ? <p role="status">{t(gps.error)}</p> : null}
    </> : null}
    {open ? <AddressPicker initial={value} addresses={[]} busy={false} error="" onClose={() => setOpen(false)}
      onSave={address => { onChange(address); setOpen(false); }} onSelect={address => { onChange(address); setOpen(false); }} onDelete={() => setOpen(false)} /> : null}
  </>;
}
