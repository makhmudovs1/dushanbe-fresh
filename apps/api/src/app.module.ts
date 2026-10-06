import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AdminCatalogModule } from "./admin/catalog/admin-catalog.module";
import { CatalogModule } from "./catalog/catalog.module";
import { HealthModule } from "./health/health.module";
import { CheckoutModule } from "./checkout/checkout.module";
import { OperationsModule } from "./operations/operations.module";
import { AuthModule } from "./auth/auth.module";
import { MediaModule } from "./media/media.module";
import { StaffModule } from "./staff/staff.module";
import { DeliveryFinanceModule } from "./delivery-finance/delivery-finance.module";
import { PublicOrdersModule } from "./public-orders/public-orders.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),
    HealthModule,
    AuthModule,
    MediaModule,
    StaffModule,
    DeliveryFinanceModule,
    PublicOrdersModule,
    CatalogModule,
    AdminCatalogModule,
    CheckoutModule,
    OperationsModule
  ]
})
export class AppModule {}
