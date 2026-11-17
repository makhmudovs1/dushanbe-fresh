import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseInterceptors,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { MobileQuotaService } from "../mobile-quota.service";
import {
  MobileAuthService,
  assertNativeTransport,
  tokenHash,
} from "../mobile-auth.service";
import { MobileResponseInterceptor } from "../mobile-response.interceptor";
import type { MobileRequest } from "../mobile-auth.controller";
import {
  addressSearchConfig,
  parseAddressPoint,
  parseAddressQuery,
  reverseDeliveryAddress,
  searchDeliveryAddresses,
} from "./geoapify-provider";
type Request = MobileRequest & {
  headers: MobileRequest["headers"] & { "x-df-geocoder-grant"?: string };
};
@UseInterceptors(MobileResponseInterceptor)
@Controller("mobile/geocoding")
export class MobileGeocodingController {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(MobileQuotaService) private readonly quota: MobileQuotaService,
    @Inject(MobileAuthService) private readonly auth: MobileAuthService,
  ) {}
  private config() {
    return addressSearchConfig(process.env);
  }
  @Get("status") status() {
    return {
      enabled:
        process.env.MOBILE_GEOCODER_ENABLED === "true" &&
        this.quota.configured() &&
        this.config().provider === "geoapify",
    };
  }
  private enabled() {
    if (!this.status().enabled)
      throw new ServiceUnavailableException(
        "Поиск адреса временно недоступен.",
      );
  }
  @Post("grant") async grant(@Req() req: Request) {
    assertNativeTransport(req.headers);
    this.enabled();
    await this.quota.consume("geo-grant-ip", req.ip, 3, 600);
    await this.quota.consume("geo-grant-global", "all", 100, 600);
    const grant = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 300000);
    await this.db.mobileGeocoderGrant.create({
      data: {
        tokenHash: tokenHash(grant),
        identityHash: this.quota.identity(req.ip),
        expiresAt,
      },
    });
    return { grant, expiresAt: expiresAt.toISOString() };
  }
  private async reserve(req: Request, cost: number) {
    assertNativeTransport(req.headers);
    this.enabled();
    const user = await this.auth.session(req.headers.authorization, false);
    if (!user) {
      const grant = req.headers["x-df-geocoder-grant"];
      if (!grant || !/^[a-f0-9]{64}$/.test(grant))
        throw new UnauthorizedException();
      const changed = await this.db.mobileGeocoderGrant.updateMany({
        where: {
          tokenHash: tokenHash(grant),
          identityHash: this.quota.identity(req.ip),
          expiresAt: { gt: new Date() },
          remaining: { gte: cost },
        },
        data: { remaining: { decrement: cost } },
      });
      if (!changed.count) throw new UnauthorizedException();
    }
    await this.quota.consume("geo-ip", req.ip, 40, 60, cost);
    if (user) await this.quota.consume("geo-user", user.id, 40, 60, cost);
    await this.quota.consume("geo-global", "all", 60, 60, cost);
    const configured = Number(process.env.MOBILE_GEOCODER_DAILY_LIMIT ?? 1000);
    const daily =
      Number.isInteger(configured) && configured >= 10 && configured <= 10000
        ? configured
        : 0;
    if (!daily) throw new ServiceUnavailableException();
    await this.quota.consume("geo-daily", "all", daily, 86400, cost);
  }
  private body(value: unknown, fields: string[]) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Buffer.byteLength(JSON.stringify(value), "utf8") > 2048
    )
      throw new BadRequestException();
    const body = value as Record<string, unknown>;
    if (
      Object.keys(body).some((k) => !fields.includes(k)) ||
      !["ru", "tg"].includes(String(body.language))
    )
      throw new BadRequestException();
    return body;
  }
  @Post("search") async search(@Body() value: unknown, @Req() req: Request) {
    const body = this.body(value, ["query", "language"]);
    const query = parseAddressQuery(body.query);
    if (!query) throw new BadRequestException();
    await this.reserve(req, 2);
    return this.lookup(() =>
      searchDeliveryAddresses(
        query,
        this.config(),
        undefined,
        body.language as "ru" | "tg",
      ),
    );
  }
  @Post("reverse") async reverse(@Body() value: unknown, @Req() req: Request) {
    const body = this.body(value, ["latitude", "longitude", "language"]);
    const point = parseAddressPoint(body);
    if (!point) throw new BadRequestException();
    await this.reserve(req, 1);
    return this.lookup(() =>
      reverseDeliveryAddress(
        point,
        this.config(),
        undefined,
        body.language as "ru" | "tg",
      ),
    );
  }
  private async lookup(action: () => Promise<unknown[] | null>) {
    // Per-process concurrency cap supplements persistent cross-worker request budgets.
    if (MobileGeocodingController.active >= 4)
      throw new HttpException("Поиск адреса временно недоступен.", 429);
    MobileGeocodingController.active++;
    try {
      const items = await action();
      if (items === null)
        throw new ServiceUnavailableException(
          "Поиск адреса временно недоступен.",
        );
      return { items };
    } finally {
      MobileGeocodingController.active--;
    }
  }
  private static active = 0;
}
