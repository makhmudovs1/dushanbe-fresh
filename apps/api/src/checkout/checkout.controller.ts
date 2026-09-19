import { Body, Controller, Inject, Post } from "@nestjs/common";
import { CheckoutService } from "./checkout.service";
import { parseCheckout, parseCreateOrder } from "./checkout.validation";

@Controller("checkout")
export class CheckoutController {
  constructor(@Inject(CheckoutService) private readonly checkout: CheckoutService) {}
  @Post("validate")
  validate(@Body() body: unknown) { return this.checkout.validate(parseCheckout(body)); }
  @Post("orders")
  create(@Body() body: unknown) { return this.checkout.createOrder(parseCreateOrder(body)); }
}
