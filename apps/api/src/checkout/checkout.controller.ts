import { Body, Controller, Headers, Inject, Post } from "@nestjs/common";
import { assertCustomerOrigin, CustomerAuthService } from "../customer-account/customer-auth.service";
import { CheckoutService } from "./checkout.service";
import { parseCheckout, parseCreateOrder } from "./checkout.validation";

@Controller("checkout")
export class CheckoutController {
  constructor(@Inject(CheckoutService) private readonly checkout: CheckoutService,
    @Inject(CustomerAuthService) private readonly auth: CustomerAuthService) {}
  @Post("validate")
  validate(@Body() body: unknown) { return this.checkout.validate(parseCheckout(body)); }
  @Post("orders")
  async create(@Body() body: unknown, @Headers("cookie") cookie?: string, @Headers("origin") origin?: string) {
    const status = this.auth.status();
    const user = await this.auth.session(cookie, status.requiredForCheckout || (status.enabled && this.auth.hasSessionCookie(cookie)));
    if (user) assertCustomerOrigin(origin);
    const input = parseCreateOrder(user && body && typeof body === "object" ? { ...body, phone: user.phone } : body);
    return this.checkout.createOrder(input, user?.id);
  }
}
