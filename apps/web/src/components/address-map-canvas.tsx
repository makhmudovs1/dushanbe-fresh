"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Polygon } from "leaflet";
import { LocateFixed } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { validCoordinatePoint, type DeliveryZone } from "@dushanbe-fresh/shared";
import { mapTileConfiguration } from "@/lib/map-tiles";

export type DeliveryPoint = { latitude: number; longitude: number };
export function AddressMapCanvas({ point, zone, onChange, onMoving, onLocate, onInteraction, locating = false, locationError = "" }: {
  point: { latitude?: number | null; longitude?: number | null }; zone?: DeliveryZone | null;
  onChange: (point: DeliveryPoint) => void; onMoving?: (moving: boolean) => void;
  onLocate: () => void; onInteraction: () => void; locating?: boolean; locationError?: string;
}) {
  const { t } = useI18n();
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const leaflet = useRef<typeof import("leaflet") | null>(null);
  const overlay = useRef<Polygon | null>(null);
  const current = useRef({ point, onChange, onMoving, onInteraction, t }); current.current = { point, onChange, onMoving, onInteraction, t };
  const programmatic = useRef<DeliveryPoint | null>(null);
  const [ready, setReady] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    let removeInteractions: (() => void) | undefined;
    void import("leaflet").then(L => {
      if (cancelled || !element.current) return;
      leaflet.current = L;
      const value = current.current.point;
      const center: [number, number] = validCoordinatePoint(value) ? [value.latitude!, value.longitude!] : [38.575, 68.787];
      const instance = L.map(element.current, { zoomControl: false, minZoom: 3, maxZoom: 19, worldCopyJump: true,
        dragging: true, touchZoom: true, scrollWheelZoom: true, doubleClickZoom: true, keyboard: true }).setView(center, 17);
      map.current = instance;
      L.control.zoom({ position: "bottomright", zoomInTitle: current.current.t("Приблизить"), zoomOutTitle: current.current.t("Отдалить") }).addTo(instance);
      instance.attributionControl.setPosition("bottomleft");
      const tiles = mapTileConfiguration();
      L.tileLayer(tiles.url, { maxZoom: 19, attribution: tiles.attribution, crossOrigin: true }).on("tileerror", () => {
        if (!cancelled) setError("Карта недоступна. Адрес можно указать без точки.");
      }).addTo(instance);
      let userMotion = false, inMotion = false, resizing = false, pendingResize = false;
      const resize = () => {
        if (inMotion) { pendingResize = true; return; }
        pendingResize = false; resizing = true;
        instance.invalidateSize({ animate: false, pan: true });
        resizing = false;
      };
      instance.on("dragstart", () => { programmatic.current = null; userMotion = true; current.current.onInteraction(); });
      instance.on("zoomstart", () => { if (!programmatic.current) { userMotion = true; current.current.onInteraction(); } });
      instance.on("keydown", () => { userMotion = true; current.current.onInteraction(); });
      instance.on("movestart", () => { inMotion = true; setMoving(true); current.current.onMoving?.(true); });
      const settled = () => {
        if (resizing) return;
        const center = instance.getCenter().wrap(), target = programmatic.current;
        if (target && instance.latLngToContainerPoint([target.latitude, target.longitude]).distanceTo(instance.getSize().divideBy(2)) > 1) return;
        inMotion = false;
        setMoving(false); current.current.onMoving?.(false);
        if (target) programmatic.current = null;
        else if (userMotion) {
          userMotion = false;
          current.current.onChange({ latitude: center.lat, longitude: center.lng });
        }
        if (pendingResize) resize();
      };
      instance.on("moveend", settled);
      const interrupt = () => {
        current.current.onInteraction();
        if (!programmatic.current) return;
        instance.stop(); programmatic.current = null; userMotion = true; settled();
      };
      const container = element.current;
      const interactionEvents = ["pointerdown", "touchstart", "mousedown", "wheel", "keydown"];
      for (const name of interactionEvents) container.addEventListener(name, interrupt, { capture: true });
      removeInteractions = () => { for (const name of interactionEvents) container.removeEventListener(name, interrupt, { capture: true }); };
      instance.on("click", event => { current.current.onInteraction(); userMotion = true; instance.panTo(event.latlng, { animate: !matchMedia("(prefers-reduced-motion: reduce)").matches }); });
      // Preserve the center on layout changes; resize events must not end an active fly/drag.
      observer = new ResizeObserver(resize); observer.observe(element.current);
      setReady(true);
    }).catch(() => { if (!cancelled) setError("Карта недоступна. Адрес можно указать без точки."); });
    return () => { cancelled = true; removeInteractions?.(); observer?.disconnect(); map.current?.remove(); map.current = null; leaflet.current = null; overlay.current = null; };
  }, []);
  useEffect(() => {
    const point = current.current.point;
    if (!ready || !validCoordinatePoint(point) || !map.current) return;
    if (map.current.latLngToContainerPoint([point.latitude!, point.longitude!]).distanceTo(map.current.getSize().divideBy(2)) <= 1) return;
    map.current.stop();
    programmatic.current = { latitude: point.latitude!, longitude: point.longitude! };
    map.current.flyTo([point.latitude!, point.longitude!], Math.max(map.current.getZoom(), 17), {
      animate: !matchMedia("(prefers-reduced-motion: reduce)").matches, duration: .45
    });
  }, [point.latitude, point.longitude, ready]);
  useEffect(() => {
    if (!ready || !map.current || !leaflet.current) return;
    overlay.current?.remove(); overlay.current = null;
    if (zone?.enabled && zone.polygon) overlay.current = leaflet.current.polygon(zone.polygon.coordinates[0].map(([lon, lat]) => [lat, lon]), {
      color: "#14834b", weight: 2, opacity: .85, fillColor: "#2db875", fillOpacity: .13, interactive: false, className: "address-zone-polygon"
    }).addTo(map.current);
  }, [zone, ready]);
  return <div className={`address-map-canvas${moving ? " is-moving" : ""}`}>
    <div className="address-map-canvas__tiles" ref={element} role="region" aria-label={t("Точка доставки на карте")} />
    <div className="address-center-pin" aria-hidden="true"><span /></div>
    <button className="address-map-gps" type="button" disabled={locating} onClick={onLocate} aria-label={t("Моё местоположение")} title={t("Моё местоположение")}><LocateFixed size={21} aria-hidden="true" /></button>
    {error || locationError ? <p className="address-map-notice" role="status">{t(locationError || error)}</p> : null}
  </div>;
}
