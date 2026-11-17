import { Module } from "@nestjs/common";
import { CustomerAccountModule } from "../customer-account/customer-account.module";
import { MobileModule } from "../mobile/mobile.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AccountDeletionService } from "./account-deletion.service";
import { CustomerAccountDeletionController, MobileAccountDeletionController } from "./account-deletion.controller";
@Module({ imports: [PrismaModule, CustomerAccountModule, MobileModule], controllers: [CustomerAccountDeletionController, MobileAccountDeletionController], providers: [AccountDeletionService] })
export class AccountDeletionModule {}
