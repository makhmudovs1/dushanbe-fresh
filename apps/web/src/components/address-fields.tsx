"use client";
import { useEffect, useId, useRef, useState } from "react";
import { MapPin, LocateFixed, X } from "lucide-react";
import type { AddressInput } from "@dushanbe-fresh/shared";
import type { Map as LeafletMap, Marker } from "leaflet";
import { useI18n } from "@/i18n/provider";
import { CatalogDialog } from "./catalog-dialog";

export const emptyAddress: AddressInput = { housingType: "apartment", street: "", building: "", apartment: "", entrance: "", floor: "", instructions: "", latitude: null, longitude: null };

export function AddressMap({ value, onChange }: { value: AddressInput; onChange: (point: { latitude: number; longitude: number }) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const callback = useRef(onChange);
  callback.current = onChange;
  const initial = useRef(value);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const [error, setError] = useState("");
  const { t } = useI18n();
  const zoomLabels = useRef({ zoomInTitle: t("Приблизить"), zoomOutTitle: t("Отдалить"), markerTitle: t("Точка доставки на карте") });
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then(L => {
      if (cancelled || !element.current) return;
      const position = initial.current;
      const center: [number, number] = position.latitude != null && position.longitude != null ? [position.latitude, position.longitude] : [38.56, 68.77];
      const instance = L.map(element.current, { zoomControl: false }).setView(center, 15);
      L.control.zoom(zoomLabels.current).addTo(instance);
      map.current = instance;
      L.tileLayer(process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).on("tileerror", () => setError("Карта недоступна. Адрес можно указать без точки.")).addTo(instance);
      const point = L.marker(center, { draggable: true, title: zoomLabels.current.markerTitle, alt: zoomLabels.current.markerTitle,
        icon: L.divIcon({ className: "delivery-address-marker", iconSize: [24, 24], iconAnchor: [12, 12] }) });
      marker.current = point;
      if (position.latitude != null) point.addTo(instance);
      point.on("dragend", () => { const position = point.getLatLng(); callback.current({ latitude: position.lat, longitude: position.lng }); });
      instance.on("click", event => { point.setLatLng(event.latlng).addTo(instance); callback.current({ latitude: event.latlng.lat, longitude: event.latlng.lng }); });
    }).catch(() => setError("Карта недоступна. Адрес можно указать без точки."));
    return () => { cancelled = true; map.current?.remove(); map.current = null; marker.current = null; };
  }, []);
  useEffect(() => {
    if (value.latitude != null && value.longitude != null && map.current && marker.current) {
      marker.current.setLatLng([value.latitude, value.longitude]).addTo(map.current);
      map.current.panTo([value.latitude, value.longitude]);
    } else if (map.current && marker.current) {
      marker.current.remove();
    }
  }, [value.latitude, value.longitude]);
  return <><div className="address-map" ref={element} role="region" aria-label={t("Точка доставки на карте")} />
    <button className="secondary-link" type="button" onClick={() => {
      const center = map.current?.getCenter();
      if (center && map.current && marker.current) { marker.current.setLatLng(center).addTo(map.current); callback.current({ latitude: center.lat, longitude: center.lng }); }
    }}>{t("Выбрать центр карты")}</button>
    {error ? <p role="status">{t(error)}</p> : null}</>;
}

export function AddressFields({ value, onChange, fields = "all", onChooseMap }: {
  value: AddressInput; onChange: (address: AddressInput) => void;
  fields?: "all" | "street" | "details"; onChooseMap?: () => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  function locate() {
    setError("");
    if (!navigator.geolocation) { setError("Геолокация недоступна. Укажите адрес вручную."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      onChange({ ...value, latitude: position.coords.latitude, longitude: position.coords.longitude }); setLocating(false);
    }, () => { setError("Не удалось определить местоположение. Укажите адрес вручную."); setLocating(false); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }
  return <>
    {fields !== "street" ? <div className="housing-toggle" role="group" aria-label={t("Тип жилья")}>
      {(["apartment", "house"] as const).map(type => <label key={type}><input type="radio" name={`housing-${id}`} checked={(value.housingType ?? "apartment") === type} onChange={() => onChange({ ...value, housingType: type, ...(type === "house" ? { apartment: "", entrance: "", floor: "" } : {}) })} /><span>{t(type === "house" ? "Частный дом" : "Квартира")}</span></label>)}
    </div> : null}
    <div className="checkout-input-grid">
      {fields !== "details" ? <>
        <label className="field">{t("Улица")}<input autoComplete="address-line1" required maxLength={150} value={value.street} onChange={event => onChange({ ...value, street: event.target.value })} /></label>
        <label className="field">{t("Дом")}<input autoComplete="address-line2" required maxLength={30} value={value.building} onChange={event => onChange({ ...value, building: event.target.value })} /></label>
      </> : null}
      {fields !== "street" && value.housingType !== "house" ? ([['apartment', 'Квартира'], ['entrance', 'Подъезд'], ['floor', 'Этаж']] as const).map(([key, label]) => <label className="field" key={key}>{t(label)}<input maxLength={30} value={value[key]} onChange={event => onChange({ ...value, [key]: event.target.value })} /></label>) : null}
    </div>
    {fields !== "street" ? <>
    <label className="field">{t("Комментарий / ориентир")}<textarea aria-label={t("Комментарий / ориентир")} rows={2} maxLength={500} value={value.instructions} onChange={event => onChange({ ...value, instructions: event.target.value })} /></label>
    <div className="address-tools">
      <button className="secondary-link" type="button" onClick={() => onChooseMap ? onChooseMap() : setOpen(true)}><MapPin size={18} aria-hidden="true" />{t(value.latitude == null ? "Поставить точку на карте" : "Изменить точку на карте")}</button>
      <button className="secondary-link" type="button" disabled={locating} onClick={locate}><LocateFixed size={18} aria-hidden="true" />{t(locating ? "Определяем..." : "Моё местоположение")}</button>
      {value.latitude != null ? <><small>{value.latitude.toFixed(5)}, {value.longitude?.toFixed(5)}</small><button className="catalog-icon-action" type="button" aria-label={t("Удалить точку")} title={t("Удалить точку")} onClick={() => onChange({ ...value, latitude: null, longitude: null })}><X size={18} /></button></> : null}
    </div>
    {error ? <p role="status">{t(error)}</p> : null}
    </> : null}
    {open ? <CatalogDialog title={t("Точка доставки на карте")} busy={false} onClose={() => setOpen(false)} closeLabel={t("Закрыть карту")} className="address-map-dialog">
      <AddressMap value={value} onChange={point => onChange({ ...value, ...point })} />
      <button type="button" className="primary-action" onClick={() => setOpen(false)}>{t("Готово")}</button>
    </CatalogDialog> : null}
  </>;
}
