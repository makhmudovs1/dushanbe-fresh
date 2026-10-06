import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { Roles, StaffRequest } from "../auth/staff.guard";
import { DeliveryFinanceService } from "./delivery-finance.service";
import { CashShiftsService } from "./cash-shifts.service";
import { DeliveryBackofficeService } from "./delivery-backoffice.service";

@Roles("admin", "courier")
@Controller("admin")
export class DeliveryFinanceController {
  constructor(@Inject(DeliveryFinanceService) private readonly finance: DeliveryFinanceService,
    @Inject(CashShiftsService) private readonly shifts: CashShiftsService,
    @Inject(DeliveryBackofficeService) private readonly backoffice: DeliveryBackofficeService) {}
  @Get("orders/:id/finances") get(@Param("id") id: string, @Req() req: StaffRequest) { return this.finance.get(id, req.staff!); }
  @Post("orders/:id/issues/preview") preview(@Param("id") id: string, @Body() body: unknown, @Req() req: StaffRequest) { return this.finance.preview(id, body, req.staff!); }
  @Post("orders/:id/issues") issue(@Param("id") id: string, @Body() body: unknown, @Req() req: StaffRequest) { return this.finance.issue(id, body, req.staff!); }
  @Post("orders/:id/collection") collect(@Param("id") id: string, @Body() body: unknown, @Req() req: StaffRequest) { return this.finance.collect(id, body, req.staff!); }
  @Post("orders/:id/refund") refund(@Param("id") id: string, @Body() body: unknown, @Req() req: StaffRequest) { return this.finance.refund(id, body, req.staff!); }
  @Post("orders/:id/close-delivery") complete(@Param("id") id: string, @Body() body: unknown, @Req() req: StaffRequest) { return this.finance.complete(id, body, req.staff!); }
  @Post("orders/:id/adjustments") @Roles("admin") adjustment(@Param("id") id: string, @Body() body: unknown, @Req() req: StaffRequest) { return this.finance.adjustment(id, body, req.staff!); }
  @Post("orders/:id/cash-corrections") @Roles("admin") correctCash(@Param("id") id: string, @Body() body: unknown, @Req() req: StaffRequest) { return this.finance.correctCash(id, body, req.staff!); }
  @Post("orders/:id/reschedule") @Roles("admin") reschedule(@Param("id") id: string, @Body() body: unknown, @Req() req: StaffRequest) { return this.backoffice.reschedule(id, body, req.staff!); }
  @Get("orders/:id/audit") @Roles("admin") audit(@Param("id") id: string) { return this.backoffice.audit(id); }
  @Get("delivery-issues") @Roles("admin") issues() { return this.backoffice.issues(); }
  @Patch("delivery-issues/:id") @Roles("admin") review(@Param("id") id: string, @Body() body: unknown, @Req() req: StaffRequest) { return this.finance.review(id, body, req.staff!); }
  @Get("customers") @Roles("admin") customers(@Query("search") search?: string) { return this.backoffice.customers(search); }
  @Get("customers/:id") @Roles("admin") customer(@Param("id") id: string) { return this.backoffice.customer(id); }
  @Patch("customers/:id") @Roles("admin") updateCustomer(@Param("id") id: string, @Body() body: unknown, @Req() req: StaffRequest) { return this.backoffice.updateCustomer(id, body, req.staff!); }
  @Get("cash-shifts") shiftsList(@Req() req: StaffRequest) { return this.shifts.list(req.staff!); }
  @Post("cash-shifts/:id/submit") submit(@Param("id") id: string, @Body() body: unknown, @Req() req: StaffRequest) { return this.shifts.submit(id, body, req.staff!); }
  @Post("cash-shifts/:id/reconcile") @Roles("admin") reconcile(@Param("id") id: string, @Body() body: unknown, @Req() req: StaffRequest) { return this.shifts.reconcile(id, body, req.staff!); }
  @Get("cash-statistics") @Roles("admin") statistics() { return this.shifts.statistics(); }
  @Patch("settings/delivery-finance") @Roles("admin") settings(@Body() body: unknown, @Req() req: StaffRequest) { return this.backoffice.settings(body, req.staff!); }
}
