import { Module } from "@nestjs/common";

import { CatalogModule } from "../../catalog/catalog.module";
import { AdminCatalogController } from "./admin-catalog.controller";

@Module({
  imports: [CatalogModule],
  controllers: [AdminCatalogController]
})
export class AdminCatalogModule {}
