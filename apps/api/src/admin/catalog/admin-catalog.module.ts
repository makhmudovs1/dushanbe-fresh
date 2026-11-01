import { Module } from "@nestjs/common";

import { CatalogModule } from "../../catalog/catalog.module";
import { AdminCatalogController } from "./admin-catalog.controller";
import { AdminPricingController } from "./admin-pricing.controller";

@Module({
  imports: [CatalogModule],
  controllers: [AdminCatalogController, AdminPricingController]
})
export class AdminCatalogModule {}
