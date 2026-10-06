import { Module } from "@nestjs/common";
import { ImageStorage, LocalImageStorage } from "./image-storage";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";

@Module({
  controllers: [MediaController],
  providers: [MediaService, { provide: ImageStorage, useClass: LocalImageStorage }]
})
export class MediaModule {}
