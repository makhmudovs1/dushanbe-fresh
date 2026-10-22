import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { CatalogModule } from "../catalog/catalog.module";
import { CustomerAuthService, CustomerSmsGateway } from "./customer-auth.service";
import { CustomerAuthController } from "./customer-auth.controller";
import { CustomerAccountService } from "./customer-account.service";
import { CustomerAccountController } from "./customer-account.controller";

@Module({ imports: [PrismaModule, CatalogModule], controllers: [CustomerAuthController, CustomerAccountController],
  providers: [CustomerSmsGateway, CustomerAuthService, CustomerAccountService], exports: [CustomerAuthService] })
export class CustomerAccountModule {}
