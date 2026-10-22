"use client";
import { useI18n } from "@/i18n/provider";


import * as React from "react";
import Image from "next/image";

export function ProductImage({ src, name, eager = false }: { src: string | null; name: string; eager?: boolean }) {
  const { t } = useI18n();
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  const source = src && src !== failedSrc ? src : "/brand/icon-v2.png";
  const placeholder = !src || source !== src || source.startsWith("/brand/");
  // API normalizes uploads to <=1600px WebP; no second optimizer or remote host allowlist needed.
  return <><Image unoptimized className={source === src ? "product-image" : "product-image product-image--placeholder"} src={source} alt={t(placeholder ? `${name}: фото пока нет` : name)}
    width={640} height={480} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailedSrc(src)} />
    {placeholder ? <span className="product-image__fallback-label" aria-hidden="true">{t("Фото появится позже")}</span> : null}</>;
}
