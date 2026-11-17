import { BadRequestException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AccountDeletionCapability, AccountDeletionReceipt, CustomerProfile } from "@dushanbe-fresh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { MobileQuotaService } from "../mobile/mobile-quota.service";

export function deletionCapability(env: Record<string, string | undefined>): AccountDeletionCapability {
  const version = env.CUSTOMER_ACCOUNT_DELETION_POLICY_VERSION ?? "";
  const ru = env.CUSTOMER_ACCOUNT_DELETION_NOTICE_RU?.trim() ?? "";
  const tg = env.CUSTOMER_ACCOUNT_DELETION_NOTICE_TG?.trim() ?? "";
  const validText = (text: string) => text.length >= 20 && text.length <= 4000 && !Array.from(text).some(c => (c.charCodeAt(0) < 32 && ![9, 10, 13].includes(c.charCodeAt(0))) || c.charCodeAt(0) === 127);
  const available = env.CUSTOMER_ACCOUNT_DELETION_REQUESTS_ENABLED === "true" && /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(version) && validText(ru) && validText(tg);
  return { available, mode: "request", policyVersion: available ? version : null, retentionNotice: available ? { ru, tg } : null };
}

@Injectable()
export class AccountDeletionService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(MobileQuotaService) private readonly quota: MobileQuotaService) {}
  capability(): AccountDeletionCapability {
    const result = deletionCapability(process.env);
    return this.quota.configured() ? result : { available: false, mode: "request", policyVersion: null, retentionNotice: null };
  }
  async request(user: CustomerProfile, value: unknown): Promise<AccountDeletionReceipt> {
    const capability = this.capability();
    if (!capability.available) throw new ServiceUnavailableException("Удаление аккаунта временно недоступно.");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException();
    const body = value as Record<string, unknown>;
    if (Object.keys(body).some(k => !["requestId", "confirmation"].includes(k)) || typeof body.requestId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId) || body.confirmation !== "DELETE_ACCOUNT") throw new BadRequestException("Подтвердите удаление аккаунта.");
    await this.quota.consume("account-deletion", user.id, 3, 3600);
    try {
      return await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
        const current = await tx.user.findUnique({ where: { id: user.id } });
        if (!current || current.status !== "active" || current.role !== "customer" || current.roles.length || !current.phoneVerifiedAt || current.phone !== user.phone) throw new UnauthorizedException();
        let request = await tx.customerAccountDeletionRequest.findUnique({ where: { userId: user.id } });
        if (!request) request = await tx.customerAccountDeletionRequest.create({ data: { id: body.requestId as string, userId: user.id, policyVersion: capability.policyVersion! } });
        const now = new Date();
        await tx.customerSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
        await tx.mobileCustomerSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
        await tx.customerOtpChallenge.updateMany({ where: { phone: user.phone, consumedAt: null }, data: { consumedAt: now } });
        // This is a persisted deletion REQUEST, not erasure or deactivation.
        // No customer/order/financial records are removed before retention approval.
        return { requestId: request.id, requestedAt: request.requestedAt.toISOString(), status: "requested" as const };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new BadRequestException("Повторите запрос с новым идентификатором.");
      throw error;
    }
  }
}
