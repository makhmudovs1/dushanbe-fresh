import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { StaffUser } from "@dushanbe-fresh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { DeliveryFinanceService } from "./delivery-finance.service";
import { D, sum } from "./calculator";
import { decimal, object, text } from "../operations/operations.rules";
import { isAdmin } from "../operations/operations.access";

const include = { transactions: { include: { order: { select: { id: true, orderNumber: true, deliveryClosedAt: true } } }, orderBy: { createdAt: "asc" as const } } } as const;
type Shift = Prisma.CourierShiftGetPayload<{ include: typeof include }>;
function view(shift: Shift) {
  const rows = shift.transactions;
  return { ...shift, expectedCash: (shift.expectedCash ?? sum(rows.map(row => row.amount))).toFixed(2),
    collectionTotal: sum(rows.filter(row => row.type === "collection").map(row => row.amount)).toFixed(2),
    refundTotal: sum(rows.filter(row => row.type === "cash_refund").map(row => row.amount)).abs().toFixed(2),
    correctionTotal: sum(rows.filter(row => row.type === "correction").map(row => row.amount)).toFixed(2),
    ordersCount: new Set(rows.map(row => row.orderId)).size };
}
@Injectable()
export class CashShiftsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(DeliveryFinanceService) private readonly finance: DeliveryFinanceService) {}
  async list(actor: StaffUser) {
    const shifts = await this.prisma.courierShift.findMany({ where: isAdmin(actor) ? {} : { courierId: actor.id }, include, orderBy: { openedAt: "desc" } });
    const staff = await this.prisma.user.findMany({ where: { id: { in: shifts.map(shift => shift.courierId) } }, select: { id: true, name: true } });
    return shifts.map(shift => ({ ...view(shift), courierName: staff.find(user => user.id === shift.courierId)?.name }));
  }
  async submit(id: string, value: unknown, actor: StaffUser) {
    const body = object(value); const declared = decimal(body.declaredCash, 2, "Фактически сдаю");
    return this.finance.transaction(async tx => {
      actor = await this.finance.actor(tx, actor);
      await tx.$queryRaw`SELECT id FROM courier_shifts WHERE id = ${id} FOR UPDATE`;
      const shift = await tx.courierShift.findUnique({ where: { id }, include });
      if (!shift) throw new NotFoundException();
      if (!isAdmin(actor) && (shift.courierId !== actor.id || !actor.roles.includes("courier"))) throw new ForbiddenException();
      if (shift.status !== "open") {
        if (shift.declaredCash?.eq(declared)) return view(shift);
        throw new ConflictException("Смена уже сдана. Корректировку рассматривает администратор.");
      }
      if (shift.transactions.some(row => !row.order.deliveryClosedAt)) throw new ConflictException("Сначала завершите передачи заказов или передайте их администратору.");
      const expected = sum(shift.transactions.map(row => row.amount)); const variance = declared.minus(expected);
      const note = text(body.note, "Причина расхождения", variance.isZero() && !isAdmin(actor));
      await tx.courierShift.update({ where: { id }, data: { status: variance.isZero() ? "submitted" : "discrepancy", closedAt: new Date(), expectedCash: expected, declaredCash: declared, variance, note } });
      await tx.operationalAudit.create({ data: { userId: actor.id, action: "cash.shift_submitted", entityId: id, details: { expected: expected.toFixed(2), declared: declared.toFixed(2), variance: variance.toFixed(2), note } } });
      return view(await tx.courierShift.findUniqueOrThrow({ where: { id }, include }));
    });
  }
  async reconcile(id: string, value: unknown, actor: StaffUser) {
    const body = object(value); const note = text(body.note, "Результат сверки");
    if (!["reconciled", "discrepancy"].includes(String(body.status))) throw new BadRequestException("Выберите результат сверки.");
    return this.finance.transaction(async tx => {
      actor = await this.finance.actor(tx, actor, true);
      await tx.$queryRaw`SELECT id FROM courier_shifts WHERE id = ${id} FOR UPDATE`;
      const shift = await tx.courierShift.findUnique({ where: { id } });
      if (!shift) throw new NotFoundException();
      if (shift.status === "open") throw new ConflictException("Курьер ещё не сдал смену.");
      if (shift.status === body.status && shift.reviewNote === note) return shift;
      const result = await tx.courierShift.update({ where: { id }, data: { status: body.status as "reconciled" | "discrepancy", reviewedByUserId: actor.id, reviewedAt: new Date(), reviewNote: note } });
      await tx.operationalAudit.create({ data: { userId: actor.id, action: "cash.shift_reviewed", entityId: id, details: { status: body.status as string, note } } });
      return result;
    });
  }
  async statistics() {
    const rows = await this.prisma.cashTransaction.findMany({ where: { type: "collection" } });
    const couriers = await this.prisma.user.findMany({ where: { id: { in: rows.map(row => row.courierId) } }, select: { id: true, name: true } });
    return couriers.map(courier => {
      const own = rows.filter(row => row.courierId === courier.id);
      const expected = sum(own.map(row => row.expectedAmount ?? new D(0))); const collected = sum(own.map(row => row.amount));
      return { ...courier, deliveriesCount: own.length, expectedCash: expected.toFixed(2), reportedCollected: collected.toFixed(2), totalVariance: collected.minus(expected).toFixed(2),
        unpaidCount: own.filter(row => row.amount.isZero() && row.expectedAmount?.gt(0)).length,
        partialCount: own.filter(row => row.amount.gt(0) && row.expectedAmount?.gt(row.amount)).length };
    });
  }
}
