import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import { PricingService } from "./pricing.service";

@Module({
  imports: [PrismaModule],
  controllers: [CatalogController],
  providers: [CatalogService, PricingService],
  exports: [CatalogService, PricingService]
})
export class CatalogModule {}
