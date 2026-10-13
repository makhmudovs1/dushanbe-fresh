import type { Product } from "./api";

export function productPhotos(product: Pick<Product, "image" | "images">) {
  const images = [...(product.images ?? [])].filter(image => image.url)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder);
  return images.length ? images : product.image ? [{ url: product.image, isPrimary: true, sortOrder: 0 }] : [];
}

export function swipeDirection(dx: number, dy: number) {
  return Math.abs(dx) >= 35 && Math.abs(dx) > Math.abs(dy) * 1.5 ? (dx < 0 ? 1 : -1) : 0;
}
