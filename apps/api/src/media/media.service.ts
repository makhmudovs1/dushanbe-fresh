import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { ImageStorage } from "./image-storage";

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export type ImageUpload = { buffer: Buffer; mimetype: string; size: number };

@Injectable()
export class MediaService {
  constructor(@Inject(ImageStorage) private readonly storage: ImageStorage) {}

  async upload(file?: ImageUpload) {
    if (!file) throw new BadRequestException("Выберите фотографию товара.");
    if (file.size > IMAGE_MAX_BYTES || file.buffer.length > IMAGE_MAX_BYTES) throw new BadRequestException("Фотография должна быть не больше 5 МБ.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) throw new BadRequestException("Выберите изображение JPEG, PNG или WebP.");
    let content: Buffer;
    try {
      const input = sharp(file.buffer, { limitInputPixels: 25_000_000 });
      const metadata = await input.metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) throw new Error("Unsupported image");
      // Decode and re-encode: remove metadata, apply phone orientation, never serve raw uploads.
      content = await input.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    } catch {
      throw new BadRequestException("Не удалось прочитать фото. Используйте обычное JPEG, PNG или WebP до 25 мегапикселей, без анимации.");
    }
    const key = `${randomUUID()}.webp`;
    await this.storage.put(key, content);
    return { image: `/api/v1/media/${key}` };
  }

  read(key: string) {
    if (!/^[a-f0-9-]{36}\.webp$/.test(key)) throw new NotFoundException("Фотография не найдена.");
    return this.storage.get(key);
  }
}
