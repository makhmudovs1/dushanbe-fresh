import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { IMAGE_MAX_BYTES, MediaService } from "./media.service";

function setup() {
  const storage = { put: vi.fn(), get: vi.fn() };
  return { storage, service: new MediaService(storage) };
}

describe("product image uploads", () => {
  it.each(["jpeg", "png", "webp"] as const)("decodes %s and stores only a normalized WebP with a relative URL", async format => {
    const { storage, service } = setup();
    const buffer = await sharp({ create: { width: 24, height: 12, channels: 3, background: "green" } }).toFormat(format).toBuffer();
    const result = await service.upload({ buffer, size: buffer.length, mimetype: `image/${format}` });
    expect(result.image).toMatch(/^\/api\/v1\/media\/[a-f0-9-]+\.webp$/);
    expect((await sharp(storage.put.mock.calls[0][1]).metadata()).format).toBe("webp");
  });
  it("rejects unsupported MIME types and disguised non-images", async () => {
    const { storage, service } = setup();
    const file = { buffer: Buffer.from("<svg></svg>"), size: 11, mimetype: "image/svg+xml" };
    await expect(service.upload(file)).rejects.toThrow("JPEG, PNG или WebP");
    await expect(service.upload({ ...file, mimetype: "image/png" })).rejects.toThrow("Не удалось прочитать");
    expect(storage.put).not.toHaveBeenCalled();
  });
  it("rejects oversized files and missing files", async () => {
    const { service, storage } = setup();
    await expect(service.upload({ buffer: Buffer.alloc(1), size: IMAGE_MAX_BYTES + 1, mimetype: "image/jpeg" })).rejects.toThrow("5 МБ");
    await expect(service.upload()).rejects.toThrow("Выберите фотографию");
    expect(storage.put).not.toHaveBeenCalled();
  });
  it("never overwrites the old image on replacement and rejects path traversal", async () => {
    const { service, storage } = setup();
    const buffer = await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).png().toBuffer();
    const file = { buffer, size: buffer.length, mimetype: "image/png" };
    expect((await service.upload(file)).image).not.toBe((await service.upload(file)).image);
    expect(() => service.read("../../.env")).toThrow("Фотография не найдена");
    expect(storage.get).not.toHaveBeenCalled();
  });
});
