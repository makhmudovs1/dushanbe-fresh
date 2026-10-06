import { Controller, Get, Header, HttpException, Inject, Injectable, Module, NotFoundException, Param, Req } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { mapPublicOrder, publicOrderInclude } from "./public-orders.mapper";

@Injectable()
export class PublicOrdersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async get(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new NotFoundException("Заказ не найден.");
    // All related reads share one snapshot while staff may be changing delivery finances.
    const order = await this.prisma.$transaction(tx => tx.order.findUnique({ where: { publicTrackingToken: token }, include: publicOrderInclude }), { isolationLevel: "RepeatableRead" });
    if (!order) throw new NotFoundException("Заказ не найден.");
    return mapPublicOrder(order);
  }
}

@Controller("public/orders")
export class PublicOrdersController {
  private readonly requests = new Map<string, { count: number; until: number }>();
  constructor(@Inject(PublicOrdersService) private readonly orders: PublicOrdersService) {}
  @Get(":trackingToken")
  @Header("Cache-Control", "private, no-store")
  @Header("X-Robots-Tag", "noindex, nofollow")
  @Header("Referrer-Policy", "no-referrer")
  get(@Param("trackingToken") token: string, @Req() request: { ip: string }) {
    const now = Date.now();
    for (const [key, entry] of this.requests) if (entry.until <= now) this.requests.delete(key);
    // Like login, bounded process-local limits; do not trust arbitrary forwarded IP headers.
    const entry = this.requests.get(request.ip) ?? { count: 0, until: now + 60000 };
    if (entry.count >= 300 || this.requests.size >= 10000) throw new HttpException("Слишком много запросов. Попробуйте через минуту.", 429);
    entry.count++; this.requests.set(request.ip, entry);
    return this.orders.get(token);
  }
}
@Module({ imports: [PrismaModule], controllers: [PublicOrdersController], providers: [PublicOrdersService] })
export class PublicOrdersModule {}
