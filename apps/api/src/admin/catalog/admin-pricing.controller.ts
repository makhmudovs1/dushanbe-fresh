import { Body, Controller, Get, Inject, Patch, Post, Req } from "@nestjs/common";
import { Roles, StaffRequest } from "../../auth/staff.guard";
import { PricingService } from "../../catalog/pricing.service";

@Roles("admin")
@Controller("admin/pricing")
export class AdminPricingController {
  constructor(@Inject(PricingService) private readonly pricing: PricingService) {}

  @Get("settings")
  settings() { return this.pricing.settings(); }

  @Patch("settings")
  updateSettings(@Body() body: Record<string, unknown>, @Req() request: StaffRequest) {
    return this.pricing.updateSettings(body, request.staff.id);
  }

  @Post("bulk/preview")
  preview(@Body() body: Record<string, unknown>, @Req() request: StaffRequest) {
    return this.pricing.preview(body, request.staff.id);
  }

  @Post("bulk/apply")
  apply(@Body() body: Record<string, unknown>, @Req() request: StaffRequest) {
    return this.pricing.apply(body, request.staff.id);
  }

  @Get("bulk/last")
  last() { return this.pricing.last(); }

  @Post("bulk/undo")
  undo(@Body() body: Record<string, unknown>, @Req() request: StaffRequest) {
    return this.pricing.undo(body, request.staff.id);
  }
}
