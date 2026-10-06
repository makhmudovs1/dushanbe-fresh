import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import { Roles, StaffRequest } from "../auth/staff.guard";
import { StaffService } from "./staff.service";

@Roles("admin")
@Controller("admin/staff")
export class StaffController {
  constructor(@Inject(StaffService) private readonly staff: StaffService) {}
  @Get() list() { return this.staff.list(); }
  @Post() create(@Body() body: unknown, @Req() req: StaffRequest) { return this.staff.create(body, req.staff); }
  @Patch(":id") update(@Param("id") id: string, @Body() body: unknown, @Req() req: StaffRequest) { return this.staff.update(id, body, req.staff); }
  @Post(":id/password") password(@Param("id") id: string, @Body() body: unknown, @Req() req: StaffRequest) { return this.staff.password(id, body, req.staff); }
}
