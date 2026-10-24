import { Body, Controller, Get, Header, Headers, HttpCode, Inject, Param, Post, Put, BadRequestException } from "@nestjs/common";
import { assertCustomerOrigin, CustomerAuthService } from "./customer-auth.service";
import { CustomerShoppingService } from "./customer-shopping.service";
import { parseCartImport, parseCartWrite, shoppingRecord } from "./customer-shopping.validation";

@Controller("customer")
export class CustomerShoppingController {
  constructor(@Inject(CustomerAuthService) private readonly auth: CustomerAuthService,
    @Inject(CustomerShoppingService) private readonly shopping: CustomerShoppingService) {}

  private async userId(cookie?: string) { return (await this.auth.session(cookie, true))!.id; }

  @Get("favorites")
  @Header("Cache-Control", "private, no-store")
  async favorites(@Headers("cookie") cookie?: string) { return this.shopping.favorites(await this.userId(cookie)); }

  @Put("favorites/:productId")
  @Header("Cache-Control", "private, no-store")
  async favorite(@Param("productId") productId: string, @Body() value: unknown, @Headers("cookie") cookie?: string, @Headers("origin") origin?: string) {
    assertCustomerOrigin(origin);
    const userId = await this.userId(cookie);
    const body = shoppingRecord(value, ["active"]);
    if (typeof body.active !== "boolean") throw new BadRequestException("Выберите, добавить товар в избранное или удалить его.");
    return this.shopping.setFavorite(userId, productId, body.active);
  }

  @Get("cart")
  @Header("Cache-Control", "private, no-store")
  async cart(@Headers("cookie") cookie?: string) { return this.shopping.cart(await this.userId(cookie)); }

  @Put("cart")
  @Header("Cache-Control", "private, no-store")
  async replace(@Body() value: unknown, @Headers("cookie") cookie?: string, @Headers("origin") origin?: string) {
    assertCustomerOrigin(origin);
    const userId = await this.userId(cookie);
    return this.shopping.replaceCart(userId, parseCartWrite(value));
  }

  @Post("cart/import")
  @Header("Cache-Control", "private, no-store")
  @HttpCode(200)
  async import(@Body() value: unknown, @Headers("cookie") cookie?: string, @Headers("origin") origin?: string) {
    assertCustomerOrigin(origin);
    const userId = await this.userId(cookie);
    return this.shopping.importCart(userId, parseCartImport(value));
  }
}
