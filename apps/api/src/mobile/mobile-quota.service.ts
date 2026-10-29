import {
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHmac } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
@Injectable()
export class MobileQuotaService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  configured() {
    return (this.secret()?.trim().length ?? 0) >= 32;
  }
  private secret() {
    return process.env.MOBILE_QUOTA_SECRET || process.env.CUSTOMER_OTP_SECRET;
  }
  identity(value: string) {
    if (!this.configured())
      throw new ServiceUnavailableException(
        "Мобильный сервис временно недоступен.",
      );
    return createHmac("sha256", this.secret()!).update(value).digest("hex");
  }
  async consume(
    scope: string,
    identity: string,
    maximum: number,
    seconds: number,
    cost = 1,
  ) {
    const key = this.identity(`${scope}:${identity}`);
    const rows = await this.db.$queryRaw<Array<{ count: number }>>`
   INSERT INTO mobile_api_limits (key, count, resets_at) VALUES (${key}, ${cost}, NOW() + ${seconds} * INTERVAL '1 second')
   ON CONFLICT (key) DO UPDATE SET count = CASE WHEN mobile_api_limits.resets_at <= NOW() THEN ${cost} ELSE mobile_api_limits.count + ${cost} END,
   resets_at = CASE WHEN mobile_api_limits.resets_at <= NOW() THEN NOW() + ${seconds} * INTERVAL '1 second' ELSE mobile_api_limits.resets_at END RETURNING count`;
    if (rows[0].count > maximum)
      throw new HttpException("Слишком много попыток. Попробуйте позже.", 429);
  }
}
