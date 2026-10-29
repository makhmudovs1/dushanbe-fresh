import { MobileResponseInterceptor } from "./mobile-response.interceptor";
import {
  Body,
  Controller,
  Inject,
  Post,
  Req,
  UseInterceptors,
} from "@nestjs/common";
import {
  MobileAuthService,
  assertNativeTransport,
} from "./mobile-auth.service";
import { CheckoutService } from "../checkout/checkout.service";
import { parseCreateOrder } from "../checkout/checkout.validation";
import type { MobileRequest } from "./mobile-auth.controller";
@UseInterceptors(MobileResponseInterceptor)
@Controller("mobile/checkout")
export class MobileCheckoutController {
  constructor(
    @Inject(MobileAuthService) private readonly auth: MobileAuthService,
    @Inject(CheckoutService) private readonly checkout: CheckoutService,
  ) {}
  @Post("orders") async create(
    @Body() body: unknown,
    @Req() req: MobileRequest,
  ) {
    assertNativeTransport(req.headers);
    const user = await this.auth.session(
      req.headers.authorization,
      this.auth.status().requiredForCheckout,
    );
    const input = parseCreateOrder(
      user && body && typeof body === "object"
        ? { ...body, phone: user.phone }
        : body,
    );
    return this.checkout.createOrder(input, user?.id);
  }
}
