import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { CustomerAccountModule } from "../customer-account/customer-account.module";
import { CheckoutModule } from "../checkout/checkout.module";
import { MobileQuotaService } from "./mobile-quota.service";
import { MobileAuthService } from "./mobile-auth.service";
import { MobileAuthController } from "./mobile-auth.controller";
import { MobileCustomerController } from "./mobile-customer.controller";
import { MobileCheckoutController } from "./mobile-checkout.controller";

@Module({ imports: [PrismaModule, CustomerAccountModule, CheckoutModule],
  providers: [MobileQuotaService, MobileAuthService],
  controllers: [MobileAuthController, MobileCustomerController, MobileCheckoutController] })
export class MobileModule {}
