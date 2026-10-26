"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Polygon } from "leaflet";
import { Check, CheckCheck, Focus, Pencil, Pentagon, Trash2, Upload, X } from "lucide-react";
import { parseDeliveryPolygon, parseDeliveryZone, type DeliveryZoneState } from "@dushanbe-fresh/shared";
import { mapTileConfiguration } from "@/lib/map-tiles";

export function DeliveryZoneEditor({ initial, busy, onSave }: { initial: DeliveryZoneState; busy: boolean; onSave: (state: DeliveryZoneState) => void }) {
  const [draft, setDraft] = useState(initial.zone);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<"view" | "draw" | "edit">("view");
  const [error, setError] = useState("");
  const [invalidGeometry, setInvalidGeometry] = useState(false);
  const [ready, setReady] = useState(false);
  const element = useRef<HTMLDivElement>(null), upload = useRef<HTMLInputElement>(null);
  const map = useRef<LeafletMap | null>(null), layer = useRef<Polygon | null>(null);
  const initialPolygon = useRef(initial.zone.polygon);
  const install = useRef<(polygon: NonNullable<typeof draft.polygon>) => void>(() => {});
  useEffect(() => {
    let cancelled = false; let observer: ResizeObserver | undefined;
    void (async () => {
      const L = await import("leaflet");
      await import("@geoman-io/leaflet-geoman-free");
      if (cancelled || !element.current) return;
      const instance = L.map(element.current, { minZoom: 3, maxZoom: 19, worldCopyJump: true }).setView([38.575, 68.787], 13);
      map.current = instance;
      instance.pm.setLang("ru");
      instance.pm.setGlobalOptions({ allowSelfIntersection: false, snappable: false });
      const tiles = mapTileConfiguration();
      L.tileLayer(tiles.url, { maxZoom: 19, attribution: tiles.attribution, crossOrigin: true, pmIgnore: true }).on("tileerror", () => {
        if (!cancelled) setError("Не удалось загрузить карту.");
      }).addTo(instance);
      function changed(value: Polygon) {
        const polygon = parseDeliveryPolygon(value.toGeoJSON().geometry);
        setDirty(true); setInvalidGeometry(!polygon);
        if (polygon) { setDraft(current => ({ ...current, polygon })); setError(""); }
        else setError("Проверьте границы: многоугольник не должен пересекать себя.");
      }
      function watch(value: Polygon) { value.on("pm:change", () => changed(value)); }
      install.current = polygon => {
        instance.pm.disableDraw(); instance.pm.disableGlobalEditMode(); layer.current?.remove();
        const value = L.polygon(polygon.coordinates[0].map(([lon, lat]) => [lat, lon]), { color: "#14834b", weight: 2, fillColor: "#2db875", fillOpacity: .18 }).addTo(instance);
        layer.current = value; watch(value);
        instance.fitBounds(value.getBounds(), { padding: [30, 30], maxZoom: 16 });
        setMode("view");
      };
      instance.on("pm:create", event => {
        if (event.shape !== "Polygon") return;
        layer.current?.remove(); layer.current = event.layer as Polygon;
        watch(layer.current); changed(layer.current);
        setMode("edit"); layer.current.pm.enable({ allowSelfIntersection: false, snappable: false });
      });
      instance.on("pm:drawend", () => setMode(current => current === "draw" ? "view" : current));
      if (initialPolygon.current) install.current(initialPolygon.current);
      observer = new ResizeObserver(() => instance.invalidateSize({ animate: false, pan: true })); observer.observe(element.current);
      setReady(true);
    })().catch(() => { if (!cancelled) setError("Не удалось открыть редактор карты. Повторите загрузку."); });
    return () => { cancelled = true; observer?.disconnect(); map.current?.remove(); map.current = null; layer.current = null; install.current = () => {}; };
  }, []);
  useEffect(() => {
    if (busy) { map.current?.pm.disableDraw(); layer.current?.pm.disable(); setMode("view"); }
  }, [busy]);
  const valid = !!parseDeliveryZone(draft) && !invalidGeometry;
  return <form className="delivery-zone-editor" onSubmit={event => { event.preventDefault(); if (valid && !busy && dirty && mode !== "draw") onSave({ zone: draft, revision: initial.revision }); }}>
    <div className="delivery-zone-editor__policy">
      <label className="staff-checkbox"><input type="checkbox" checked={draft.enabled} disabled={busy} onChange={event => { setDraft(current => ({ ...current, enabled: event.target.checked })); setDirty(true); }} />Ограничить доставку зоной</label>
      <span className="delivery-zone-editor__status">{draft.enabled ? "Только внутри многоугольника" : "Без пространственных ограничений"}</span>
    </div>
    <div className="delivery-zone-editor__toolbar" role="toolbar" aria-label="Границы доставки">
      <button className="catalog-icon-action" type="button" title="Нарисовать зону" aria-label="Нарисовать зону" disabled={!ready || busy || mode === "draw"} onClick={() => { layer.current?.pm.disable(); map.current?.pm.enableDraw("Polygon", { allowSelfIntersection: false, snappable: false, pathOptions: { color: "#14834b", fillColor: "#2db875", fillOpacity: .18 } }); setMode("draw"); }}><Pentagon size={20} /></button>
      <button className="catalog-icon-action" type="button" title="Изменить вершины" aria-label="Изменить вершины" aria-pressed={mode === "edit"} disabled={!ready || busy || !draft.polygon || mode === "draw"} onClick={() => { if (mode === "edit") layer.current?.pm.disable(); else layer.current?.pm.enable({ allowSelfIntersection: false, snappable: false }); setMode(mode === "edit" ? "view" : "edit"); }}><Pencil size={20} /></button>
      <button className="catalog-icon-action" type="button" title="Показать всю зону" aria-label="Показать всю зону" disabled={!ready || busy || !draft.polygon} onClick={() => { if (layer.current) map.current?.fitBounds(layer.current.getBounds(), { padding: [30, 30], maxZoom: 16 }); }}><Focus size={20} /></button>
      <button className="catalog-icon-action" type="button" title="Импорт GeoJSON" aria-label="Импорт GeoJSON" disabled={!ready || busy} onClick={() => upload.current?.click()}><Upload size={20} /></button>
      <input className="delivery-zone-editor__upload" ref={upload} type="file" accept=".json,.geojson,application/json,application/geo+json" aria-label="Файл GeoJSON" onChange={event => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (!file) return;
        if (file.size > 65536) { setError("Файл GeoJSON должен быть не больше 64 КБ."); return; }
        void file.text().then(text => {
          const input = JSON.parse(text);
          const polygon = parseDeliveryPolygon(input?.type === "Feature" ? input.geometry : input);
          if (!polygon) throw new Error("Invalid polygon");
          install.current(polygon); setDraft(current => ({ ...current, polygon })); setDirty(true); setInvalidGeometry(false); setError("");
        }).catch(() => setError("Нужен GeoJSON Polygon без отверстий и пересечений, от 3 до 200 вершин."));
      }} />
      <button className="catalog-icon-action" type="button" title="Удалить многоугольник" aria-label="Удалить многоугольник" disabled={!ready || busy || !draft.polygon || mode === "draw"} onClick={() => {
        if (!window.confirm("Удалить многоугольник из черновика? Изменения применятся после сохранения.")) return;
        map.current?.pm.disableGlobalEditMode(); layer.current?.remove(); layer.current = null;
        setDraft(current => ({ ...current, polygon: null })); setDirty(true); setInvalidGeometry(false); setMode("view");
      }}><Trash2 size={20} /></button>
      {mode === "draw" ? <>
        <button className="catalog-icon-action" type="button" title="Завершить многоугольник" aria-label="Завершить многоугольник" onClick={() => { if (!map.current?.pm.finishDraw()) setError("Для зоны нужны как минимум три вершины."); }}><CheckCheck size={20} /></button>
        <button className="catalog-icon-action" type="button" title="Отменить рисование" aria-label="Отменить рисование" onClick={() => { map.current?.pm.disableDraw(); setMode("view"); }}><X size={20} /></button>
      </> : null}
      <span>{draft.polygon ? `${draft.polygon.coordinates[0].length - 1} вершин` : "Границы не заданы"}</span>
    </div>
    <div ref={element} className="delivery-zone-editor__map" role="region" aria-label="Редактор зоны доставки" />
    {error ? <p role="alert" className="notice">{error}</p> : null}
    {draft.enabled && !draft.polygon ? <p role="alert" className="notice">Нарисуйте зону, чтобы включить ограничение.</p> : null}
    <div className="delivery-zone-editor__footer"><span role="status">{dirty ? "Есть несохранённые изменения" : "Изменений нет"}</span>
      <button className="primary-action" disabled={busy || !dirty || !valid || mode === "draw"}><Check size={18} />{busy ? "Сохраняем..." : "Сохранить зону"}</button>
    </div>
  </form>;
}
