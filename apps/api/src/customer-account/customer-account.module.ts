import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { CatalogModule } from "../catalog/catalog.module";
import { CustomerAuthService, CustomerSmsGateway } from "./customer-auth.service";
import { CustomerAuthController } from "./customer-auth.controller";
import { CustomerAccountService } from "./customer-account.service";
import { CustomerAccountController } from "./customer-account.controller";
import { CustomerShoppingController } from "./customer-shopping.controller";
import { CustomerShoppingService } from "./customer-shopping.service";
import { CustomerSmsBudgetService } from "./customer-sms-budget.service";
import { CustomerSmsAdminController } from "./customer-sms-admin.controller";

@Module({ imports: [PrismaModule, CatalogModule], controllers: [CustomerAuthController, CustomerAccountController, CustomerShoppingController, CustomerSmsAdminController],
  providers: [CustomerSmsGateway, CustomerSmsBudgetService, CustomerAuthService, CustomerAccountService, CustomerShoppingService], exports: [CustomerSmsBudgetService, CustomerAuthService, CustomerAccountService, CustomerShoppingService] })
export class CustomerAccountModule {}
