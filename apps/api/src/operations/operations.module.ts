import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { OperationsController } from "./operations.controller";
import { OperationsService } from "./operations.service";
import { DeliveryFinanceModule } from "../delivery-finance/delivery-finance.module";

@Module({ imports: [PrismaModule, DeliveryFinanceModule], controllers: [OperationsController], providers: [OperationsService] })
export class OperationsModule {}
