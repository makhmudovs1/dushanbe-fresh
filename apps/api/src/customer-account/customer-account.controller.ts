import { Body, Controller, Delete, Get, Header, Headers, Inject, Param, Patch, Post, Query, Res } from "@nestjs/common";
import { assertCustomerOrigin, CustomerAuthService } from "./customer-auth.service";
import { CustomerAccountService } from "./customer-account.service";
import { parseSavedAddress } from "./customer-address.validation";

@Controller("customer")
export class CustomerAccountController {
  constructor(@Inject(CustomerAuthService) private readonly auth: CustomerAuthService,
    @Inject(CustomerAccountService) private readonly account: CustomerAccountService) {}
  private async user(cookie?: string, origin?: string) {
    if (origin !== undefined) assertCustomerOrigin(origin);
    return (await this.auth.session(cookie, true))!;
  }
  @Get("addresses")
  @Header("Cache-Control", "private, no-store")
  async addresses(@Headers("cookie") cookie?: string) { return this.account.addresses((await this.user(cookie)).id); }
  @Post("addresses")
  async add(@Body() body: unknown, @Headers("cookie") cookie?: string, @Headers("origin") origin?: string) {
    assertCustomerOrigin(origin); return this.account.saveAddress(await this.user(cookie), parseSavedAddress(body));
  }
  @Patch("addresses/:id")
  async edit(@Param("id") id: string, @Body() body: unknown, @Headers("cookie") cookie?: string, @Headers("origin") origin?: string) {
    assertCustomerOrigin(origin); return this.account.saveAddress(await this.user(cookie), parseSavedAddress(body), id);
  }
  @Delete("addresses/:id")
  async remove(@Param("id") id: string, @Headers("cookie") cookie?: string, @Headers("origin") origin?: string) {
    assertCustomerOrigin(origin); return this.account.deleteAddress((await this.user(cookie)).id, id);
  }
  @Patch("profile")
  async profile(@Body() body: { name?: unknown }, @Headers("cookie") cookie?: string, @Headers("origin") origin?: string) {
    assertCustomerOrigin(origin); return this.account.updateName(await this.user(cookie), body?.name);
  }
  @Get("orders")
  @Header("Cache-Control", "private, no-store")
  async orders(@Headers("cookie") cookie?: string, @Query("before") before?: string) { return this.account.orders((await this.user(cookie)).id, before); }
  @Get("orders/:id")
  async order(@Param("id") id: string, @Headers("cookie") cookie?: string, @Res({ passthrough: true }) res?: { setHeader(name: string, value: string): void }) {
    res?.setHeader("Cache-Control", "private, no-store");
    return this.account.order((await this.user(cookie)).id, id);
  }
  @Post("orders/:id/repeat")
  async repeat(@Param("id") id: string, @Headers("cookie") cookie?: string, @Headers("origin") origin?: string) {
    assertCustomerOrigin(origin); return this.account.repeat((await this.user(cookie)).id, id);
  }
  @Post("claim-order")
  async claim(@Body() body: { token?: unknown }, @Headers("cookie") cookie?: string, @Headers("origin") origin?: string) {
    assertCustomerOrigin(origin); return this.account.claim(await this.user(cookie), body?.token);
  }
}
