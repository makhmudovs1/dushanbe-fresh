import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, StaffRole } from "@prisma/client";
import type { StaffUser } from "@dushanbe-fresh/shared";
import { hash } from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { staffSelect } from "../auth/auth.service";
import { object, text } from "../operations/operations.rules";
import { audit } from "../operations/operations.audit";

const pickerWork: Prisma.DeliveryWaveWhereInput = { status: { notIn: ["delivered", "cancelled"] } };
const courierWork: Prisma.DeliveryWaveWhereInput = { OR: [
  pickerWork,
  { orders: { some: { status: "delivered", paymentStatus: "pending" } } }
] };
const assignmentsSelect = { id: true, status: true } as const;
const employeeSelect = { ...staffSelect,
  pickerWaves: { where: pickerWork, select: assignmentsSelect },
  courierWaves: { where: courierWork, select: assignmentsSelect }
} as const;

function rolesInput(value: unknown): StaffRole[] {
  if (!Array.isArray(value) || !value.length || value.some(role => !Object.values(StaffRole).includes(role))) {
    throw new BadRequestException("Выберите роль сборщика или курьера. Доступ администратора назначается отдельно.");
  }
  return [...new Set(value)] as StaffRole[];
}
function passwordInput(value: unknown) {
  if (typeof value !== "string" || value.length < 12 || Buffer.byteLength(value) > 72) throw new BadRequestException("Пароль: минимум 12 символов, не больше 72 байт.");
  return value;
}

@Injectable()
export class StaffService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async list() {
    const users = await this.prisma.user.findMany({ where: { roles: { isEmpty: false } }, select: employeeSelect, orderBy: [{ name: "asc" }, { email: "asc" }] });
    return users.map(({ pickerWaves, courierWaves, ...user }) => ({ ...user,
      assignments: [...pickerWaves.map(wave => ({ ...wave, role: "picker" })), ...courierWaves.map(wave => ({ ...wave, role: "courier" }))]
    }));
  }

  private async transaction<T>(actor: StaffUser, action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          const admin = await tx.user.findFirst({ where: { id: actor.id, status: "active", roles: { has: "admin" } } });
          if (!admin) throw new ForbiddenException("Недостаточно прав.");
          return action(tx);
        }, { isolationLevel: "Serializable" });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === "P2034" && attempt < 2) continue;
          if (error.code === "P2034") throw new ConflictException("Данные изменились. Обновите список и повторите действие.");
          if (error.code === "P2002") throw new ConflictException("Этот email уже используется.");
        }
        throw error;
      }
    }
    throw new ConflictException("Повторите действие.");
  }

  async create(value: unknown, actor: StaffUser) {
    const body = object(value);
    const name = text(body.name, "Имя", false, 120);
    const email = text(body.email, "Электронная почта", false, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException("Введите корректный email.");
    const roles = rolesInput(body.roles);
    if (roles.includes("admin") && body.confirmAdmin !== true) throw new BadRequestException("Подтвердите предоставление полного доступа администратора.");
    const passwordHash = await hash(passwordInput(body.password), 12);
    return this.transaction(actor, async tx => {
      const user = await tx.user.create({ data: { name, email, passwordHash, roles, role: roles[0] }, select: staffSelect });
      await audit(tx, actor, "staff.created", user.id);
      return user;
    });
  }

  async update(id: string, value: unknown, actor: StaffUser) {
    const body = object(value);
    const roles = body.roles === undefined ? undefined : rolesInput(body.roles);
    const name = body.name === undefined ? undefined : text(body.name, "Имя", false, 120);
    if (body.status !== undefined && !["active", "inactive"].includes(String(body.status))) throw new BadRequestException("Выберите состояние сотрудника.");
    const status = body.status as "active" | "inactive" | undefined;
    return this.transaction(actor, async tx => {
      const user = await tx.user.findUnique({ where: { id }, select: staffSelect });
      if (!user || !user.roles.length) throw new NotFoundException("Сотрудник не найден.");
      const nextRoles = roles ?? user.roles;
      const nextStatus = status ?? user.status;
      if (nextRoles.includes("admin") && !user.roles.includes("admin") && body.confirmAdmin !== true) throw new BadRequestException("Подтвердите предоставление полного доступа администратора.");
      if (id === actor.id && (nextStatus !== "active" || !nextRoles.includes("admin"))) throw new ConflictException("Нельзя отключить собственный административный доступ. Обратитесь к другому администратору.");
      if (user.roles.includes("admin") && (nextStatus !== "active" || !nextRoles.includes("admin"))) {
        const others = await tx.user.count({ where: { id: { not: id }, status: "active", roles: { has: "admin" } } });
        if (!others) throw new ConflictException("Нельзя отключить последнего администратора.");
      }
      const lost = user.roles.filter(role => nextStatus !== "active" || !nextRoles.includes(role));
      const conflicts = await tx.deliveryWave.findMany({ where: { OR: [
        ...(lost.includes("picker") ? [{ AND: [pickerWork, { pickerUserId: id }] }] : []),
        ...(lost.includes("courier") ? [{ AND: [courierWork, { courierUserId: id }] }] : [])
      ] }, select: { id: true } });
      if (conflicts.length) throw new ConflictException(`Сотруднику назначены незавершённые волны (${conflicts.length}) или доставки без отметки оплаты. Сначала переназначьте их в разделе «Волны доставки», затем повторите изменение.`);
      const result = await tx.user.update({ where: { id }, data: { name, roles, status }, select: staffSelect });
      const rolesChanged = roles && (roles.length !== user.roles.length || roles.some(role => !user.roles.includes(role)));
      if (rolesChanged || status === "inactive") await tx.refreshSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await audit(tx, actor, "staff.updated", id);
      return result;
    });
  }

  async password(id: string, value: unknown, actor: StaffUser) {
    const passwordHash = await hash(passwordInput(object(value).password), 12);
    return this.transaction(actor, async tx => {
      const user = await tx.user.findFirst({ where: { id, roles: { isEmpty: false } } });
      if (!user) throw new NotFoundException("Сотрудник не найден.");
      await tx.user.update({ where: { id }, data: { passwordHash } });
      await tx.refreshSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await audit(tx, actor, "staff.password_reset", id);
      return { success: true };
    });
  }
}
