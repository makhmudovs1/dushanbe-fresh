import { BadRequestException, ForbiddenException, HttpException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { parse, serialize } from "cookie";
import type { CustomerProfile } from "@dushanbe-fresh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { normalizePhone } from "../customers/phone";
import { PayomSmsAdapter } from "./payom-sms.adapter";
import { otpSecretReady, payomReadiness, smsPilotConfiguration } from "./payom-configuration";

export function customerPhone(value: unknown) {
  if (typeof value !== "string" || value.length > 32) throw new BadRequestException("Введите номер телефона +992.");
  const phone = normalizePhone(value);
  if (!/^\+992\d{9}$/.test(phone)) throw new BadRequestException("Введите номер телефона +992.");
  return phone;
}

@Injectable()
export class CustomerSmsGateway {
  private readonly provider = new PayomSmsAdapter();
  configured() { return this.provider.configured(); }

  async send(phone: string, code: string, requestId: string) {
    // Payom has no documented idempotency field; the challenge ID stays internal.
    void requestId;
    await this.provider.send(phone, code);
  }
}

@Injectable()
export class CustomerAuthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CustomerSmsGateway) private readonly sms: CustomerSmsGateway) {}

  status() {
    const productionReady = process.env.NODE_ENV !== "production" || payomReadiness().configurationReady;
    const enabled = process.env.CUSTOMER_AUTH_ENABLED === "true" && productionReady && otpSecretReady() && smsPilotConfiguration().valid && this.sms.configured();
    return { enabled, requiredForCheckout: enabled && process.env.CUSTOMER_REQUIRE_PHONE === "true" };
  }

  private enabled() {
    if (!this.status().enabled) throw new ServiceUnavailableException("Вход по SMS пока недоступен. Можно оформить заказ без входа.");
  }

  private hmac(value: string) { return createHmac("sha256", process.env.CUSTOMER_OTP_SECRET!).update(value).digest("hex"); }

  // Persistent atomic buckets enforce limits across workers and restarts. IP comes from req.ip, not an untrusted forwarded header.
  private async limit(scope: string, value: string, maximum: number, seconds: number) {
    const key = this.hmac(`${scope}:${value}`);
    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO customer_auth_limits (key, count, resets_at) VALUES (${key}, 1, NOW() + ${seconds} * INTERVAL '1 second')
      ON CONFLICT (key) DO UPDATE SET count = CASE WHEN customer_auth_limits.resets_at <= NOW() THEN 1 ELSE customer_auth_limits.count + 1 END,
      resets_at = CASE WHEN customer_auth_limits.resets_at <= NOW() THEN NOW() + ${seconds} * INTERVAL '1 second' ELSE customer_auth_limits.resets_at END
      RETURNING count`;
    if (rows[0].count > maximum) throw new HttpException("Слишком много попыток. Попробуйте позже.", 429);
  }

  async requestCode(value: unknown, ip: string) {
    this.enabled();
    const phone = customerPhone(value);
    const { pilot } = smsPilotConfiguration();
    if (pilot && pilot.phone !== phone) throw new ForbiddenException("Вход по SMS пока доступен только участнику проверки.");
    await this.limit("send-global", "all", 500, 3600);
    await this.limit("send-ip", ip, 20, 3600);
    await this.limit("send-phone", phone, 5, 3600);
    const id = randomUUID();
    const code = String(randomInt(100000, 1000000));
    const created = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${phone}, 7021))`;
      const recent = await tx.customerOtpChallenge.findFirst({ where: { phone, createdAt: { gt: new Date(Date.now() - 60000) } } });
      if (recent) return false;
      if (pilot) {
        // A spent pilot must not invalidate its still-valid OTP when resend is pressed.
        const key = this.hmac(`sms-pilot:${pilot.id}`);
        const reserved = await tx.$queryRaw<Array<{ key: string }>>`
          INSERT INTO customer_auth_limits (key, count, resets_at) VALUES (${key}, 1, '9999-12-31'::timestamp)
          ON CONFLICT (key) DO NOTHING RETURNING key`;
        if (!reserved.length) throw new HttpException("Проверочная SMS уже запрошена. Обратитесь в поддержку.", 429);
      }
      await tx.customerOtpChallenge.updateMany({ where: { phone, consumedAt: null }, data: { consumedAt: new Date() } });
      await tx.customerOtpChallenge.create({ data: { id, phone, codeHash: this.hmac(`${id}:${phone}:${code}`), expiresAt: new Date(Date.now() + 300000) } });
      return true;
    });
    if (!created) throw new HttpException("Новый код можно запросить через минуту.", 429);
    await this.sms.send(phone, code, id);
    // This existing marker means provider acceptance, not confirmed handset delivery.
    await this.prisma.customerOtpChallenge.update({ where: { id }, data: { sentAt: new Date() } });
    return { challengeId: id, retryAfter: 60, expiresIn: 300 };
  }

  async verify<T = undefined>(challengeId: unknown, value: unknown, ip: string, issueBrowserSession = true,
    issueTransportSession?: (tx: Prisma.TransactionClient, userId: string) => Promise<T>) {
    this.enabled();
    await this.limit("verify-ip", ip, 60, 3600);
    if (typeof challengeId !== "string" || !/^[a-f0-9-]{36}$/i.test(challengeId) || typeof value !== "string" || !/^\d{6}$/.test(value)) {
      throw new BadRequestException("Введите шестизначный код из SMS.");
    }
    const challenge = await this.prisma.customerOtpChallenge.findUnique({ where: { id: challengeId } });
    if (!challenge || !challenge.sentAt || challenge.consumedAt || challenge.expiresAt <= new Date() || challenge.attempts >= 5) throw this.invalidCode();
    const valid = timingSafeEqual(Buffer.from(challenge.codeHash, "hex"), Buffer.from(this.hmac(`${challenge.id}:${challenge.phone}:${value}`), "hex"));
    // Compare-and-swap consumes the code once. Failed attempts are committed before returning an error.
    const token = randomBytes(32).toString("hex");
    const result = await this.prisma.$transaction(async tx => {
      const changed = await tx.customerOtpChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null, sentAt: { not: null }, expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
        data: { attempts: { increment: 1 }, ...(valid ? { consumedAt: new Date() } : {}) }
      });
      if (!valid || changed.count !== 1) return null;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${challenge.phone}, 7021))`;
      let user = await tx.user.findUnique({ where: { phone: challenge.phone } });
      if (user && (user.role !== "customer" || user.roles.length || user.status !== "active")) return null;
      const customer = await tx.customer.findUnique({ where: { phoneNormalized: challenge.phone } });
      if (customer?.userId && customer.userId !== user?.id) return null;
      user = user ? await tx.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date() } })
        : await tx.user.create({ data: { phone: challenge.phone, phoneVerifiedAt: new Date() } });
      await tx.customer.upsert({ where: { phoneNormalized: challenge.phone },
        update: { userId: user.id }, create: { phoneNormalized: challenge.phone, displayName: user.name ?? "", userId: user.id } });
      if (issueBrowserSession) await tx.customerSession.create({ data: { userId: user.id, tokenHash: this.hashToken(token), expiresAt: new Date(Date.now() + 30 * 86400000) } });
      const transportSession = issueTransportSession ? await issueTransportSession(tx, user.id) : undefined;
      return { user: this.profile(user), transportSession };
    });
    if (!result) throw this.invalidCode();
    return { ...result, token };
  }

  private invalidCode() { return new UnauthorizedException("Код неверен или истёк. Запросите новый код."); }
  private hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
  cookieName() { return process.env.NODE_ENV === "production" ? "__Host-df_customer" : "df_customer"; }
  cookie(token: string, clear = false) {
    return serialize(this.cookieName(), token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: clear ? 0 : 30 * 86400 });
  }
  hasSessionCookie(cookie?: string) { try { return this.cookieName() in parse(cookie ?? ""); } catch { return false; } }
  private token(cookie?: string) {
    try { const token = parse(cookie ?? "")[this.cookieName()]; return token && /^[a-f0-9]{64}$/.test(token) ? token : null; } catch { return null; }
  }
  async session(cookie?: string, required = false): Promise<CustomerProfile | null> {
    const token = this.token(cookie);
    if (token && this.status().enabled) {
      const session = await this.prisma.customerSession.findUnique({ where: { tokenHash: this.hashToken(token) }, include: { user: true } });
      if (session && !session.revokedAt && session.expiresAt > new Date() && session.user.status === "active" && session.user.role === "customer" && !session.user.roles.length && session.user.phoneVerifiedAt && session.user.phone) return this.profile(session.user);
    }
    if (required) throw new UnauthorizedException("Войдите по номеру телефона.");
    return null;
  }
  async logout(cookie?: string) {
    const token = this.token(cookie);
    if (token) await this.prisma.customerSession.updateMany({ where: { tokenHash: this.hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  private profile(user: { id: string; name: string | null; phone: string | null; phoneVerifiedAt: Date | null }): CustomerProfile {
    return { id: user.id, name: user.name, phone: user.phone!, phoneVerifiedAt: user.phoneVerifiedAt!.toISOString() };
  }
}

export function assertCustomerOrigin(origin: string | undefined) {
  if (!origin || origin !== (process.env.WEB_ORIGIN ?? "http://localhost:3000")) throw new HttpException("Недопустимый источник запроса.", 403);
}
