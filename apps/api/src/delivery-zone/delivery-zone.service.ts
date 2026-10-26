import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DELIVERY_ZONE_KEY, parseDeliveryZone, unrestrictedDeliveryZone, type DeliveryZoneState, type StaffUser } from "@dushanbe-fresh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { audit } from "../operations/operations.audit";
import { randomUUID } from "node:crypto";

function revision(row: { value: Prisma.JsonValue; updatedAt: Date } | null): string | null {
  if (!row) return null;
  const value = row.value && typeof row.value === "object" && !Array.isArray(row.value) ? row.value.revision : null;
  return typeof value === "string" ? value : row.updatedAt.toISOString();
}

export function deliveryZoneFromSetting(value: unknown) {
  if (value === undefined) return { ...unrestrictedDeliveryZone };
  const zone = parseDeliveryZone(value);
  if (!zone) throw new ServiceUnavailableException("Не удалось проверить зону доставки. Повторите попытку.");
  return zone;
}

@Injectable()
export class DeliveryZoneService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async state(): Promise<DeliveryZoneState> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: DELIVERY_ZONE_KEY } });
    return { zone: deliveryZoneFromSetting(row?.value), revision: revision(row) };
  }
  async update(value: unknown, actor: StaffUser): Promise<DeliveryZoneState> {
    const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const zone = parseDeliveryZone(body.zone);
    if (!zone || !(body.expectedRevision === null || (typeof body.expectedRevision === "string" && body.expectedRevision.length <= 50))) {
      throw new BadRequestException("Проверьте зону: нужен простой замкнутый многоугольник без пересечений, от 3 до 200 вершин.");
    }
    try {
      return await this.prisma.$transaction(async tx => {
        const user = await tx.user.findUnique({ where: { id: actor.id }, select: { status: true, roles: true } });
        if (!user || user.status !== "active" || !user.roles.includes("admin")) throw new ForbiddenException("Недостаточно прав.");
        const old = await tx.appSetting.findUnique({ where: { key: DELIVERY_ZONE_KEY } });
        if (revision(old) !== body.expectedRevision) throw new ConflictException("Зона уже изменена другим администратором. Обновите страницу.");
        const token = randomUUID(), stored = { ...zone, revision: token };
        await tx.appSetting.upsert({ where: { key: DELIVERY_ZONE_KEY }, create: { key: DELIVERY_ZONE_KEY, value: stored }, update: { value: stored } });
        await audit(tx, actor, "settings.delivery_zone_changed", DELIVERY_ZONE_KEY);
        return { zone, revision: token };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) throw new ConflictException("Зона уже изменена другим администратором. Обновите страницу.");
      throw error;
    }
  }
}
