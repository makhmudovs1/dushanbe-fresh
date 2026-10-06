import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { DeliveryFinanceService } from "./delivery-finance.service";
import { DeliveryFinanceController } from "./delivery-finance.controller";
import { CashShiftsService } from "./cash-shifts.service";
import { DeliveryBackofficeService } from "./delivery-backoffice.service";
@Module({ imports: [PrismaModule], controllers: [DeliveryFinanceController], providers: [DeliveryFinanceService, CashShiftsService, DeliveryBackofficeService], exports: [DeliveryFinanceService] })
export class DeliveryFinanceModule {}
