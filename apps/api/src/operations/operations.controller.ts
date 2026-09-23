import { Body, Controller, ForbiddenException, Get, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { OperationsService } from "./operations.service";
import { Roles, StaffRequest } from "../auth/staff.guard";
import { object } from "./operations.rules";
import { PrismaService } from "../prisma/prisma.service";
import { mapPublicProduct } from "../catalog/catalog.mappers";
import { presentWave } from "./operations.access";

@Roles("admin")
@Controller("admin")
export class OperationsController {
  constructor(@Inject(OperationsService) private readonly operations: OperationsService, @Inject(PrismaService) private readonly prisma: PrismaService) {}
  @Get("orders") @Roles("admin", "picker", "courier")
  orders(@Req() req: StaffRequest, @Query("date") date?: string, @Query("deliverySlotId") deliverySlotId?: string, @Query("status") status?: string, @Query("tab") tab?: string) { return this.operations.orders({ date, deliverySlotId, status, tab }, req.staff); }
  @Get("orders/:id") @Roles("admin", "picker", "courier")
  order(@Req() req: StaffRequest, @Param("id") id: string) { return this.operations.order(id, req.staff); }
  @Patch("orders/:id/status") @Roles("admin", "picker", "courier")
  orderStatus(@Req() req: StaffRequest, @Param("id") id: string, @Body() body: unknown) {
    const status = object(body).status;
    if (req.staff.role !== "admin" && !(req.staff.role === "picker" ? ["picking", "picked"] : ["delivered"]).includes(String(status))) throw new ForbiddenException();
    return this.operations.updateOrderStatus(id, body, req.staff);
  }
  @Post("orders/:id/paid") @Roles("admin", "courier")
  paid(@Req() req: StaffRequest, @Param("id") id: string) { return this.operations.markPaid(id, req.staff); }
  @Post("orders/:id/pack") @Roles("admin", "picker")
  pack(@Req() req: StaffRequest, @Param("id") id: string) { return this.operations.packOrder(id, req.staff); }
  @Patch("orders/:id/items/:itemId") @Roles("admin", "picker")
  item(@Req() req: StaffRequest, @Param("id") id: string, @Param("itemId") itemId: string, @Body() body: unknown) { return this.operations.distribute(id, itemId, body, req.staff); }
  @Get("delivery-slots") slots(@Query("date") date?: string) { return this.operations.slots(date); }
  @Get("staff") staff() { return this.operations.staff(); }
  @Get("delivery-waves") @Roles("admin", "picker", "courier")
  async waves(@Req() req: StaffRequest, @Query("date") date?: string, @Query("tab") tab?: string) { return (await this.operations.waves(date, req.staff, tab)).map(wave => presentWave(wave, req.staff)); }
  @Post("delivery-waves") form(@Body() body: unknown) { return this.operations.formWave(body); }
  @Get("delivery-waves/:id") @Roles("admin", "picker", "courier")
  async wave(@Req() req: StaffRequest, @Param("id") id: string) { return presentWave(await this.operations.wave(id, req.staff), req.staff); }
  @Patch("delivery-waves/:id/assignments") assign(@Param("id") id: string, @Body() body: unknown) { return this.operations.assign(id, body); }
  @Patch("delivery-waves/:id/status") @Roles("admin", "picker", "courier")
  async waveStatus(@Req() req: StaffRequest, @Param("id") id: string, @Body() body: unknown) {
    if (req.staff.role === "picker" && !["picking", "picked"].includes(String(object(body).status))) throw new ForbiddenException();
    if (req.staff.role === "courier" && object(body).status !== "out_for_delivery") throw new ForbiddenException();
    return presentWave(await this.operations.waveStatus(id, body, req.staff), req.staff);
  }
  @Post("delivery-waves/:id/items") @Roles("admin", "picker")
  replacement(@Req() req: StaffRequest, @Param("id") id: string, @Body() body: unknown) { return this.operations.addReplacementPurchase(id, body, req.staff); }
  @Patch("delivery-waves/:id/items/:itemId") @Roles("admin", "picker")
  purchase(@Req() req: StaffRequest, @Param("id") id: string, @Param("itemId") itemId: string, @Body() body: unknown) { return this.operations.purchase(id, itemId, body, req.staff); }
  @Get("picking-products") @Roles("admin", "picker")
  async pickingProducts() {
    const products = await this.prisma.product.findMany({ where: { isActive: true, isAvailableToday: true }, include: { category: true, qualityOptions: { where: { isActive: true } } }, orderBy: { name: "asc" } });
    return products.map(product => ({ ...mapPublicProduct(product), isActive: true, isAvailableToday: true }));
  }
  @Get("settings")
  settings() { return this.prisma.appSetting.findMany({ where: { key: { in: ["minimum_order_amount", "delivery_fee", "service_fee", "purchase_price_deviation_percent", "default_picker_id", "default_courier_id"] } }, orderBy: { key: "asc" } }); }
  @Patch("settings/default-staff")
  defaultStaff(@Body() body: unknown) { return this.operations.updateDefaultStaff(body); }
  @Patch("settings/purchase-price-deviation")
  purchaseThreshold(@Body() body: unknown) { return this.operations.updatePurchaseThreshold(body); }
}
