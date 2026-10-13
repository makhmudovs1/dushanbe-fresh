"use client";

import { ArrowLeft, ArrowRight, Star, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ProductPhoto } from "@/lib/api";
import { uploadProductImage } from "@/lib/api";
import { photoFileError } from "./product-photo-field";
import { ProductImage } from "./product-image";

export function ProductGalleryField({ images, onChange, disabled, onUploading }: {
  images: ProductPhoto[]; onChange: (images: ProductPhoto[]) => void; disabled: boolean;
  onUploading: (uploading: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  const drag = useRef<number | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  function save(next: ProductPhoto[]) {
    if (next.length && !next.some(image => image.isPrimary)) next = next.map((image, index) => ({ ...image, isPrimary: index === 0 }));
    onChange(next.map((image, sortOrder) => ({ ...image, sortOrder })));
  }
  function move(from: number, to: number) {
    if (to < 0 || to >= images.length || from === to) return;
    const next = [...images]; const [image] = next.splice(from, 1); next.splice(to, 0, image); save(next);
  }
  async function upload(files: File[]) {
    if (!files.length) return;
    const problem = files.map(photoFileError).find(Boolean);
    if (problem || images.length + files.length > 12) { setError(problem ?? "Добавьте не больше 12 фотографий."); return; }
    setError(""); setUploading(true); onUploading(true);
    const next = [...images];
    try {
      for (const file of files) {
        const url = await uploadProductImage(file);
        next.push({ url, sortOrder: next.length, isPrimary: next.length === 0 });
        if (alive.current) save([...next]);
      }
    } catch (error) { if (alive.current) setError(error instanceof Error ? error.message : "Не удалось загрузить фотографии."); }
    finally { if (alive.current) { setUploading(false); onUploading(false); } }
  }
  const busy = disabled || uploading;
  return <div className="gallery-field">
    <label>Фотографии товара
      <input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => {
        const files = Array.from(event.target.files ?? []); event.target.value = ""; void upload(files);
      }} />
    </label>
    <small>JPEG, PNG или WebP, до 5 МБ каждый. Максимум 12 фото. Главное фото — обложка.</small>
    {uploading ? <p role="status">Загружаем фотографии…</p> : null}
    <div className="gallery-field__list">{images.map((image, index) => <div className="gallery-field__item" key={image.url}
      draggable={!busy} onDragStart={() => { drag.current = index; }} onDragOver={event => event.preventDefault()}
      onDrop={event => { event.preventDefault(); if (!busy && drag.current !== null) move(drag.current, index); drag.current = null; }}>
      <div className="gallery-field__preview"><ProductImage src={image.url} name={`Фото ${index + 1}`} /></div>
      <span className="gallery-field__caption">{image.isPrimary ? "Обложка" : `Фото ${index + 1}`}</span>
      <div className="gallery-field__tools">
        <button type="button" className="catalog-icon-action" disabled={busy || image.isPrimary} title="Сделать главным" aria-label={`Сделать фото ${index + 1} главным`}
          onClick={() => save(images.map(photo => ({ ...photo, isPrimary: photo.url === image.url })))}><Star size={16} fill={image.isPrimary ? "currentColor" : "none"} /></button>
        <button type="button" className="catalog-icon-action" disabled={busy || index === 0} title="Переместить раньше" aria-label={`Переместить фото ${index + 1} раньше`} onClick={() => move(index, index - 1)}><ArrowLeft size={16} /></button>
        <button type="button" className="catalog-icon-action" disabled={busy || index === images.length - 1} title="Переместить позже" aria-label={`Переместить фото ${index + 1} позже`} onClick={() => move(index, index + 1)}><ArrowRight size={16} /></button>
        <button type="button" className="catalog-icon-action catalog-delete-icon" disabled={busy} title="Убрать фотографию" aria-label={`Убрать фото ${index + 1}`} onClick={() => save(images.filter(photo => photo.url !== image.url))}><Trash2 size={16} /></button>
      </div>
    </div>)}</div>
    {error ? <p className="notice" role="alert">{error}</p> : null}
  </div>;
}
