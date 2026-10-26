import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { DeliveryZoneService } from "./delivery-zone.service";
import { DeliveryZoneController, AdminDeliveryZoneController } from "./delivery-zone.controller";

@Module({ imports: [PrismaModule], controllers: [DeliveryZoneController, AdminDeliveryZoneController], providers: [DeliveryZoneService] })
export class DeliveryZoneModule {}
