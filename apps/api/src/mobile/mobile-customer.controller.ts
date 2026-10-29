import { PrismaService } from "../prisma/prisma.service";
import { mapPublicProduct } from "../catalog/catalog.mappers";
import { MobileResponseInterceptor } from "./mobile-response.interceptor";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseInterceptors,
} from "@nestjs/common";
import { CustomerAccountService } from "../customer-account/customer-account.service";
import { CustomerShoppingService } from "../customer-account/customer-shopping.service";
import { parseSavedAddress } from "../customer-account/customer-address.validation";
import {
  parseCartImport,
  parseCartWrite,
  shoppingRecord,
} from "../customer-account/customer-shopping.validation";
import {
  MobileAuthService,
  assertNativeTransport,
} from "./mobile-auth.service";
import { MobileQuotaService } from "./mobile-quota.service";
import type { MobileRequest } from "./mobile-auth.controller";
@UseInterceptors(MobileResponseInterceptor)
@Controller("mobile/customer")
export class MobileCustomerController {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(MobileAuthService) private readonly auth: MobileAuthService,
    @Inject(CustomerAccountService)
    private readonly account: CustomerAccountService,
    @Inject(CustomerShoppingService)
    private readonly shopping: CustomerShoppingService,
    @Inject(MobileQuotaService) private readonly quota: MobileQuotaService,
  ) {}
  private async user(req: MobileRequest) {
    assertNativeTransport(req.headers);
    const user = (await this.auth.session(req.headers.authorization))!;
    await this.quota.consume("customer", user.id, 180, 60);
    return user;
  }
  @Get("cart") @Header("Cache-Control", "private, no-store") async cart(
    @Req() req: MobileRequest,
  ) {
    return this.shopping.cart((await this.user(req)).id);
  }
  @Put("cart") async replace(@Body() body: unknown, @Req() req: MobileRequest) {
    return this.shopping.replaceCart(
      (await this.user(req)).id,
      parseCartWrite(body),
    );
  }
  @Post("cart/import") async import(
    @Body() body: unknown,
    @Req() req: MobileRequest,
  ) {
    return this.shopping.importCart(
      (await this.user(req)).id,
      parseCartImport(body),
    );
  }
  @Get("favorites")
  @Header("Cache-Control", "private, no-store")
  async favorites(@Req() req: MobileRequest) {
    const user = await this.user(req);
    const rows = await this.db.customerFavorite.findMany({
      where: { userId: user.id },
      include: {
        product: {
          include: { category: true, images: true, qualityOptions: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    return {
      ids: rows.map((row) => row.productId),
      products: rows.map(({ product }) => ({
        ...mapPublicProduct(product),
        unavailable:
          !!product.deletedAt ||
          !product.isActive ||
          !product.isAvailableToday ||
          !product.category.isActive ||
          !!product.category.deletedAt,
      })),
    };
  }
  @Put("favorites/:id") async favorite(
    @Param("id") id: string,
    @Body() value: unknown,
    @Req() req: MobileRequest,
  ) {
    const user = await this.user(req);
    const body = shoppingRecord(value, ["active"]);
    if (typeof body.active !== "boolean") throw new BadRequestException();
    return this.shopping.setFavorite(user.id, id, body.active);
  }
  @Get("addresses")
  @Header("Cache-Control", "private, no-store")
  async addresses(@Req() req: MobileRequest) {
    return this.account.addresses((await this.user(req)).id);
  }
  @Post("addresses") async add(
    @Body() body: unknown,
    @Req() req: MobileRequest,
  ) {
    return this.account.saveAddress(
      await this.user(req),
      parseSavedAddress(body),
    );
  }
  @Patch("addresses/:id") async edit(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: MobileRequest,
  ) {
    return this.account.saveAddress(
      await this.user(req),
      parseSavedAddress(body),
      id,
    );
  }
  @Delete("addresses/:id") async remove(
    @Param("id") id: string,
    @Req() req: MobileRequest,
  ) {
    return this.account.deleteAddress((await this.user(req)).id, id);
  }
  @Patch("profile") async profile(
    @Body() value: unknown,
    @Req() req: MobileRequest,
  ) {
    const body = shoppingRecord(value, ["name"]);
    return this.account.updateName(await this.user(req), body.name);
  }
  @Get("orders") @Header("Cache-Control", "private, no-store") async orders(
    @Req() req: MobileRequest,
    @Query("before") before?: string,
  ) {
    return this.account.orders((await this.user(req)).id, before);
  }
  @Get("orders/:id") @Header("Cache-Control", "private, no-store") async order(
    @Param("id") id: string,
    @Req() req: MobileRequest,
  ) {
    return this.account.order((await this.user(req)).id, id);
  }
  @Post("orders/:id/repeat") async repeat(
    @Param("id") id: string,
    @Req() req: MobileRequest,
  ) {
    return this.account.repeat((await this.user(req)).id, id);
  }
}
