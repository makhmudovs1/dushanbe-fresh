"use client";

import { useEffect, useRef, useState } from "react";
import { ProductImage } from "./product-image";

export function photoFileError(file: Pick<File, "type" | "size">) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "Выберите изображение JPEG, PNG или WebP.";
  if (file.size > 5 * 1024 * 1024) return "Фотография должна быть не больше 5 МБ.";
  return null;
}

export function ProductPhotoField({ image, file, onChange, disabled, label = "Фотография товара", removeLabel = "Убрать фотографию" }: {
  image: string; file: File | null; disabled: boolean;
  label?: string;
  removeLabel?: string;
  onChange: (file: File | null, image: string) => void;
}) {
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!file) { setPreview(""); if (input.current) input.current.value = ""; return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <div className="photo-field">
    <label>{label}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={event => {
        const selected = event.target.files?.[0];
        if (!selected) return;
        const problem = photoFileError(selected);
        setError(problem ?? "");
        if (problem) event.target.value = "";
        if (!problem) onChange(selected, image);
      }} />
    </label>
    <small>JPEG, PNG или WebP, до 5 МБ.</small>
    {file ? <small className="photo-filename">Выбрано: {file.name}</small> : null}
    <div className="photo-preview"><ProductImage src={preview || image || null} name={label} /></div>
    {error ? <p role="alert" className="notice">{error}</p> : null}
    {file || image ? <button type="button" className="secondary-link" disabled={disabled} onClick={() => { onChange(null, ""); setError(""); }}>{removeLabel}</button> : null}
  </div>;
}
