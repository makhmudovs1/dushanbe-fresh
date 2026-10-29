import {
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { CustomerProfile, MobileSessionDto } from "@dushanbe-fresh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CustomerAuthService } from "../customer-account/customer-auth.service";
import { MobileQuotaService } from "./mobile-quota.service";
export const MOBILE_ACCESS_MS = 5 * 60000;
const SESSION_MS = 30 * 86400000;
export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const token = (kind: "access" | "refresh") =>
  `dfm_${kind}_${randomBytes(32).toString("hex")}`;
type NativeHeaders = {
  origin?: string;
  cookie?: string;
  authorization?: string;
};
export function assertNativeTransport(headers: NativeHeaders) {
  if (headers.origin !== undefined || headers.cookie !== undefined)
    throw new ForbiddenException("Недопустимый источник запроса.");
}
function verifiedUser(user: {
  role: string;
  roles: string[];
  status: string;
  phone: string | null;
  phoneVerifiedAt: Date | null;
}) {
  return (
    user.role === "customer" &&
    !user.roles.length &&
    user.status === "active" &&
    !!user.phone &&
    !!user.phoneVerifiedAt
  );
}
function profile(user: {
  id: string;
  name: string | null;
  phone: string | null;
  phoneVerifiedAt: Date | null;
}): CustomerProfile {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone!,
    phoneVerifiedAt: user.phoneVerifiedAt!.toISOString(),
  };
}
@Injectable()
export class MobileAuthService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(CustomerAuthService) private readonly auth: CustomerAuthService,
    @Inject(MobileQuotaService) private readonly quota: MobileQuotaService,
  ) {}
  status() {
    const available =
      process.env.MOBILE_CUSTOMER_API_ENABLED === "true" &&
      this.quota.configured();
    const web = this.auth.status();
    return {
      available,
      enabled: available && web.enabled,
      requiredForCheckout: web.requiredForCheckout,
    };
  }
  private enabled() {
    if (!this.status().enabled)
      throw new ServiceUnavailableException(
        "Вход по SMS пока недоступен. Можно оформить заказ без входа.",
      );
  }
  async code(body: { phone?: unknown }, ip: string) {
    this.enabled();
    await this.quota.consume("code", ip, 10, 600);
    return this.auth.requestCode(body.phone, ip);
  }
  async verify(body: { challengeId?: unknown; code?: unknown }, ip: string) {
    this.enabled();
    await this.quota.consume("verify", ip, 30, 600);
    const result = await this.auth.verify(
      body.challengeId,
      body.code,
      ip,
      false,
      (tx, userId) => this.issue(userId, tx),
    );
    return result.transportSession!;
  }
  private async issue(userId: string, db: Prisma.TransactionClient): Promise<MobileSessionDto> {
    const accessToken = token("access"),
      refreshToken = token("refresh");
    const accessExpiresAt = new Date(Date.now() + MOBILE_ACCESS_MS),
      expiresAt = new Date(Date.now() + SESSION_MS);
    const session = await db.mobileCustomerSession.create({
      data: {
        userId,
        accessTokenHash: tokenHash(accessToken),
        accessExpiresAt,
        expiresAt,
        refreshTokens: { create: { tokenHash: tokenHash(refreshToken) } },
      },
      include: { user: true },
    });
    if (!verifiedUser(session.user)) {
      await db.mobileCustomerSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException();
    }
    return {
      accessToken,
      refreshToken,
      accessExpiresAt: accessExpiresAt.toISOString(),
      refreshExpiresAt: expiresAt.toISOString(),
      user: profile(session.user),
    };
  }
  async session(
    authorization?: string,
    required = true,
  ): Promise<CustomerProfile | null> {
    const value = authorization?.match(
      /^Bearer (dfm_access_[a-f0-9]{64})$/,
    )?.[1];
    if (value && this.status().enabled) {
      const session = await this.db.mobileCustomerSession.findUnique({
        where: { accessTokenHash: tokenHash(value) },
        include: { user: true },
      });
      if (
        session &&
        !session.revokedAt &&
        session.expiresAt > new Date() &&
        session.accessExpiresAt > new Date() &&
        verifiedUser(session.user)
      )
        return profile(session.user);
    }
    if (required || authorization !== undefined)
      throw new UnauthorizedException("Войдите по номеру телефона.");
    return null;
  }
  async refresh(value: unknown, ip: string): Promise<MobileSessionDto> {
    this.enabled();
    await this.quota.consume("refresh", ip, 30, 60);
    if (typeof value !== "string" || !/^dfm_refresh_[a-f0-9]{64}$/.test(value))
      throw new UnauthorizedException();
    const hash = tokenHash(value);
    const accessToken = token("access"),
      refreshToken = token("refresh");
    const result = await this.db.$transaction(async (tx) => {
      const previous = await tx.mobileRefreshToken.findUnique({
        where: { tokenHash: hash },
      });
      if (!previous) return null;
      await tx.$queryRaw`SELECT id FROM mobile_customer_sessions WHERE id = ${previous.sessionId} FOR UPDATE`;
      const current = await tx.mobileRefreshToken.findUniqueOrThrow({
        where: { tokenHash: hash },
        include: { session: { include: { user: true } } },
      });
      const session = current.session;
      if (session.revokedAt || session.expiresAt <= new Date()) return null;
      if (current.usedAt || !verifiedUser(session.user)) {
        // Commit family revocation even though this refresh is rejected.
        await tx.mobileCustomerSession.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
        return null;
      }
      const accessExpiresAt = new Date(
        Math.min(Date.now() + MOBILE_ACCESS_MS, session.expiresAt.getTime()),
      );
      await tx.mobileRefreshToken.update({
        where: { tokenHash: hash },
        data: { usedAt: new Date() },
      });
      await tx.mobileRefreshToken.create({
        data: { sessionId: session.id, tokenHash: tokenHash(refreshToken) },
      });
      await tx.mobileCustomerSession.update({
        where: { id: session.id },
        data: { accessTokenHash: tokenHash(accessToken), accessExpiresAt },
      });
      return {
        user: profile(session.user),
        accessExpiresAt: accessExpiresAt.toISOString(),
        refreshExpiresAt: session.expiresAt.toISOString(),
        accessToken,
        refreshToken,
      };
    });
    if (!result) throw new UnauthorizedException("Войдите по номеру телефона.");
    return result;
  }
  async logout(refreshToken: unknown) {
    if (
      typeof refreshToken !== "string" ||
      !/^dfm_refresh_[a-f0-9]{64}$/.test(refreshToken)
    )
      throw new UnauthorizedException();
    const previous = await this.db.mobileRefreshToken.findUnique({
      where: { tokenHash: tokenHash(refreshToken) },
    });
    if (previous)
      await this.db.mobileCustomerSession.updateMany({
        where: { id: previous.sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    return { ok: true };
  }
}
