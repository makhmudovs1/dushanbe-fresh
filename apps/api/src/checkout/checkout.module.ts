import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { DeliverySlotsController } from "../delivery-slots/delivery-slots.controller";
import { DeliverySlotsService } from "../delivery-slots/delivery-slots.service";
import { CheckoutController } from "./checkout.controller";
import { CheckoutService } from "./checkout.service";
import { CustomerAccountModule } from "../customer-account/customer-account.module";

@Module({ imports: [PrismaModule, CustomerAccountModule], controllers: [CheckoutController, DeliverySlotsController],
  providers: [CheckoutService, DeliverySlotsService], exports: [CheckoutService] })
export class CheckoutModule {}
