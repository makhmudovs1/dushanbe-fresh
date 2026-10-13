import { BadRequestException } from "@nestjs/common";
import { assertCatalogImage } from "./catalog.image";

export type GalleryInput = { url: string; sortOrder: number; isPrimary: boolean };

export function parseGallery(value: unknown): GalleryInput[] {
  if (!Array.isArray(value) || value.length > 12) throw new BadRequestException("Добавьте не больше 12 фотографий.");
  const urls = new Set<string>();
  const images = value.map((item, index) => {
    if (!item || typeof item !== "object") throw new BadRequestException("Проверьте фотографии товара.");
    const record = item as Record<string, unknown>;
    if (typeof record.url !== "string" || !record.url.trim()) throw new BadRequestException("У фотографии нет адреса.");
    const url = record.url.trim();
    assertCatalogImage(url);
    if (urls.has(url)) throw new BadRequestException("Одна фотография добавлена дважды.");
    urls.add(url);
    if (record.isPrimary !== undefined && typeof record.isPrimary !== "boolean") throw new BadRequestException("Проверьте главную фотографию.");
    const sortOrder = record.sortOrder ?? index;
    if (typeof sortOrder !== "number" || !Number.isSafeInteger(sortOrder) || sortOrder < 0) throw new BadRequestException("Проверьте порядок фотографий.");
    return { url, sortOrder, isPrimary: record.isPrimary === true };
  }).sort((a, b) => a.sortOrder - b.sortOrder);
  if (images.filter(image => image.isPrimary).length > 1) throw new BadRequestException("Выберите одну главную фотографию.");
  if (images.length && !images.some(image => image.isPrimary)) images[0].isPrimary = true;
  return images.map((image, index) => ({ ...image, sortOrder: index }));
}
