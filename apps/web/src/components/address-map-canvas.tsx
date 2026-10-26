"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import { LocateFixed } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { DUSHANBE_BOUNDS, isWithinDeliveryBounds, type CityBounds } from "@/lib/delivery-address";
import { mapTileConfiguration } from "@/lib/map-tiles";

export type DeliveryPoint = { latitude: number; longitude: number };
export function AddressMapCanvas({ point, bounds = DUSHANBE_BOUNDS, onChange, onMoving, onLocate, onInteraction, locating = false, locationError = "" }: {
  point: { latitude?: number | null; longitude?: number | null }; bounds?: CityBounds;
  onChange: (point: DeliveryPoint) => void; onMoving?: (moving: boolean) => void;
  onLocate: () => void; onInteraction: () => void; locating?: boolean; locationError?: string;
}) {
  const { t } = useI18n();
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const current = useRef({ point, onChange, onMoving, onInteraction, t }); current.current = { point, onChange, onMoving, onInteraction, t };
  const programmatic = useRef(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    void import("leaflet").then(L => {
      if (cancelled || !element.current) return;
      const value = current.current.point;
      const center: [number, number] = value.latitude != null && value.longitude != null ? [value.latitude, value.longitude] : [38.575, 68.787];
      const instance = L.map(element.current, { zoomControl: false, minZoom: 11, maxZoom: 19,
        maxBounds: [[bounds[1], bounds[0]], [bounds[3], bounds[2]]], maxBoundsViscosity: 1 }).setView(center, 16);
      map.current = instance;
      L.control.zoom({ position: "bottomright", zoomInTitle: current.current.t("Приблизить"), zoomOutTitle: current.current.t("Отдалить") }).addTo(instance);
      instance.attributionControl.setPosition("bottomleft");
      const tiles = mapTileConfiguration();
      L.tileLayer(tiles.url, { maxZoom: 19, attribution: tiles.attribution, crossOrigin: true }).on("tileerror", () => {
        if (!cancelled) setError("Карта недоступна. Адрес можно указать без точки.");
      }).addTo(instance);
      let userMotion = false;
      instance.on("dragstart", () => { programmatic.current = false; userMotion = true; current.current.onInteraction(); });
      instance.on("zoomstart", () => { if (!programmatic.current) { userMotion = true; current.current.onInteraction(); } });
      instance.on("keydown", () => { userMotion = true; current.current.onInteraction(); });
      instance.on("movestart", () => { setMoving(true); current.current.onMoving?.(true); });
      instance.on("moveend", () => {
        setMoving(false); current.current.onMoving?.(false);
        if (programmatic.current) { programmatic.current = false; return; }
        if (!userMotion) return;
        userMotion = false;
        const center = instance.getCenter();
        const selected = { latitude: center.lat, longitude: center.lng };
        if (isWithinDeliveryBounds(selected, bounds)) current.current.onChange(selected);
      });
      instance.on("click", event => { current.current.onInteraction(); userMotion = true; instance.panTo(event.latlng, { animate: !matchMedia("(prefers-reduced-motion: reduce)").matches }); });
      observer = new ResizeObserver(() => instance.invalidateSize({ pan: false })); observer.observe(element.current);
    }).catch(() => { if (!cancelled) setError("Карта недоступна. Адрес можно указать без точки."); });
    return () => { cancelled = true; observer?.disconnect(); map.current?.remove(); map.current = null; };
  }, [bounds]);
  useEffect(() => {
    if (point.latitude == null || point.longitude == null || !map.current) return;
    const center = map.current.getCenter();
    if (Math.abs(center.lat - point.latitude) + Math.abs(center.lng - point.longitude) < 0.000001) return;
    programmatic.current = true;
    map.current.flyTo([point.latitude, point.longitude], Math.max(map.current.getZoom(), 16), {
      animate: !matchMedia("(prefers-reduced-motion: reduce)").matches, duration: .45
    });
  }, [point.latitude, point.longitude]);
  return <div className={`address-map-canvas${moving ? " is-moving" : ""}`}>
    <div className="address-map-canvas__tiles" ref={element} role="region" aria-label={t("Точка доставки на карте")} />
    <div className="address-center-pin" aria-hidden="true"><span><Image src="/brand/mark-v3.webp" width={28} height={28} alt="" /></span></div>
    <button className="address-map-gps" type="button" disabled={locating} onClick={onLocate} aria-label={t("Моё местоположение")} title={t("Моё местоположение")}><LocateFixed size={21} aria-hidden="true" /></button>
    {error || locationError ? <p className="address-map-notice" role="status">{t(locationError || error)}</p> : null}
  </div>;
}
