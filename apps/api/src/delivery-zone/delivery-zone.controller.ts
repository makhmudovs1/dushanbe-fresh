import { Body, Controller, Get, Header, Inject, Patch, Req } from "@nestjs/common";
import { Roles, type StaffRequest } from "../auth/staff.guard";
import { DeliveryZoneService } from "./delivery-zone.service";

@Controller("delivery-zone")
export class DeliveryZoneController {
  constructor(@Inject(DeliveryZoneService) private readonly zones: DeliveryZoneService) {}
  @Get() @Header("Cache-Control", "no-store")
  async config() { return (await this.zones.state()).zone; }
}

@Roles("admin")
@Controller("admin/settings/delivery-zone")
export class AdminDeliveryZoneController {
  constructor(@Inject(DeliveryZoneService) private readonly zones: DeliveryZoneService) {}
  @Get() @Header("Cache-Control", "no-store")
  get() { return this.zones.state(); }
  @Patch()
  update(@Body() body: unknown, @Req() request: StaffRequest) { return this.zones.update(body, request.staff); }
}
