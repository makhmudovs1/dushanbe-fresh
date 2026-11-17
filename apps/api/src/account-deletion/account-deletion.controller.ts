import { Body, Controller, Get, Header, Inject, Post, Req, UseInterceptors } from "@nestjs/common";
import { assertCustomerOrigin, CustomerAuthService } from "../customer-account/customer-auth.service";
import { MobileAuthService, assertNativeTransport } from "../mobile/mobile-auth.service";
import { MobileResponseInterceptor } from "../mobile/mobile-response.interceptor";
import type { MobileRequest } from "../mobile/mobile-auth.controller";
import { AccountDeletionService } from "./account-deletion.service";

@Controller("customer/account-deletion")
export class CustomerAccountDeletionController {
  constructor(@Inject(AccountDeletionService) private readonly deletion: AccountDeletionService, @Inject(CustomerAuthService) private readonly auth: CustomerAuthService) {}
  @Get("status") @Header("Cache-Control", "private, no-store") status() { return this.deletion.capability(); }
  @Post() @Header("Cache-Control", "private, no-store") async request(@Body() body: unknown, @Req() req: MobileRequest) {
    assertCustomerOrigin(req.headers.origin);
    return this.deletion.request((await this.auth.session(req.headers.cookie, true))!, body);
  }
}
@UseInterceptors(MobileResponseInterceptor)
@Controller("mobile/customer/account-deletion")
export class MobileAccountDeletionController {
  constructor(@Inject(AccountDeletionService) private readonly deletion: AccountDeletionService, @Inject(MobileAuthService) private readonly auth: MobileAuthService) {}
  @Get("status") status() { return this.deletion.capability(); }
  @Post() async request(@Body() body: unknown, @Req() req: MobileRequest) {
    assertNativeTransport(req.headers);
    return this.deletion.request((await this.auth.session(req.headers.authorization))!, body);
  }
}
