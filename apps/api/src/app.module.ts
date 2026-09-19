import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AdminCatalogModule } from "./admin/catalog/admin-catalog.module";
import { CatalogModule } from "./catalog/catalog.module";
import { HealthModule } from "./health/health.module";
import { CheckoutModule } from "./checkout/checkout.module";
import { OperationsModule } from "./operations/operations.module";
import { AuthModule } from "./auth/auth.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),
    HealthModule,
    AuthModule,
    CatalogModule,
    AdminCatalogModule,
    CheckoutModule,
    OperationsModule
  ]
})
export class AppModule {}
