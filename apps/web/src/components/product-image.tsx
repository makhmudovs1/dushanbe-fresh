"use client";

import * as React from "react";
import Image from "next/image";

export function ProductImage({ src, name, eager = false }: { src: string | null; name: string; eager?: boolean }) {
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  const source = src && src !== failedSrc ? src : "/images/product-placeholder.svg";
  // API normalizes uploads to <=1600px WebP; no second optimizer or remote host allowlist needed.
  return <Image unoptimized className="product-image" src={source} alt={source === src ? name : `${name}: фото пока нет`}
    width={640} height={480} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailedSrc(src)} />;
}
