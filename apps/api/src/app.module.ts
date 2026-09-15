import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AdminCatalogModule } from "./admin/catalog/admin-catalog.module";
import { CatalogModule } from "./catalog/catalog.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),
    HealthModule,
    CatalogModule,
    AdminCatalogModule
  ]
})
export class AppModule {}
