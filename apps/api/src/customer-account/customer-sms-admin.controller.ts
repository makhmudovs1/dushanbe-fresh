import { Controller, Get, Header, Inject } from "@nestjs/common";
import { Roles } from "../auth/staff.guard";
import { CustomerSmsBudgetService } from "./customer-sms-budget.service";

@Roles("admin")
@Controller("admin/settings")
export class CustomerSmsAdminController {
  constructor(@Inject(CustomerSmsBudgetService) private readonly budget: CustomerSmsBudgetService) {}

  @Get("sms-usage")
  @Header("Cache-Control", "private, no-store")
  usage() { return this.budget.usage(); }
}
