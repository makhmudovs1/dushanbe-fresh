import { BadRequestException, Controller, Get, Header, Inject, Param, Post, StreamableFile, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Roles } from "../auth/staff.guard";
import { IMAGE_MAX_BYTES, ImageUpload, MediaService } from "./media.service";

@Controller()
export class MediaController {
  constructor(@Inject(MediaService) private readonly media: MediaService) {}

  @Roles("admin")
  @Post("admin/product-images")
  @UseInterceptors(FileInterceptor("file", {
    limits: { fileSize: IMAGE_MAX_BYTES, files: 1, fields: 0 },
    fileFilter: (_request, file, callback) => callback(
      ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype) ? null : new BadRequestException("Выберите изображение JPEG, PNG или WebP."), true
    )
  }))
  upload(@UploadedFile() file?: ImageUpload) { return this.media.upload(file); }

  @Get("media/:key")
  @Header("Cache-Control", "public, max-age=31536000, immutable")
  @Header("X-Content-Type-Options", "nosniff")
  async read(@Param("key") key: string) {
    return new StreamableFile(await this.media.read(key), { type: "image/webp" });
  }
}
