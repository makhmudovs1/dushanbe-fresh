import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { CodPolicy, CustomerRisk } from "@prisma/client";
import type { StaffUser } from "@dushanbe-fresh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { DeliveryFinanceService } from "./delivery-finance.service";
import { balance, financeInclude } from "./calculator";
import { decimal, object, text } from "../operations/operations.rules";
import { readSlot } from "../delivery-slots/delivery-slots.service";
import { defaultAssignments } from "../operations/operations.defaults";

@Injectable()
export class DeliveryBackofficeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(DeliveryFinanceService) private readonly finance: DeliveryFinanceService) {}
  customers(search?: string) {
    return this.prisma.customer.findMany({ where: search ? { OR: [{ phoneNormalized: { contains: search } }, { displayName: { contains: search, mode: "insensitive" } }] } : {}, orderBy: { updatedAt: "desc" }, take: 200, include: { _count: { select: { orders: true } } } });
  }
  async customer(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id }, include: { orders: { include: { issues: { include: { paymentIssue: true } } }, orderBy: { createdAt: "desc" } } } });
    if (!customer) throw new NotFoundException();
    return { ...customer, namesUsed: [...new Set(customer.orders.map(order => (order.deliveryAddressSnapshot as { recipientName?: string } | null)?.recipientName).filter(Boolean))],
      completedOrders: customer.orders.filter(order => order.status === "delivered").length,
      serviceFaultIncidents: customer.orders.flatMap(order => order.issues).filter(issue => issue.responsibility === "service").length };
  }
  async updateCustomer(id: string, value: unknown, actor: StaffUser) {
    const body = object(value); const note = text(body.adminNote, "Примечание администратора");
    if (!Object.values(CodPolicy).includes(body.codPolicy as CodPolicy) || !Object.values(CustomerRisk).includes(body.riskStatus as CustomerRisk) || typeof body.isActive !== "boolean") throw new BadRequestException("Проверьте политику клиента.");
    return this.finance.transaction(async tx => {
      await this.finance.actor(tx, actor, true);
      const result = await tx.customer.update({ where: { id }, data: { codPolicy: body.codPolicy as CodPolicy, riskStatus: body.riskStatus as CustomerRisk, isActive: body.isActive as boolean, adminNote: note } });
      await tx.operationalAudit.create({ data: { userId: actor.id, action: "customer.policy_updated", entityId: id, details: { note, codPolicy: result.codPolicy, riskStatus: result.riskStatus, isActive: result.isActive } } });
      return result;
    });
  }
  async issues() {
    const issues = await this.prisma.deliveryIssue.findMany({ include: { paymentIssue: true, order: { include: financeInclude } }, orderBy: [{ createdAt: "desc" }] });
    const couriers = await this.prisma.user.findMany({ where: { id: { in: issues.flatMap(issue => [issue.paymentIssue?.courierId, issue.order.deliveryWave?.courierUserId].filter((id): id is string => !!id)) } }, select: { id: true, name: true } });
    return issues.sort((a, b) => Number(b.customerVerification === "customer_disputed") - Number(a.customerVerification === "customer_disputed")).map(({ order, ...issue }) => {
      const b = balance(order);
      return { ...issue, orderNumber: order.orderNumber, customerId: order.customerId, address: order.deliveryAddressSnapshot,
        courierId: issue.paymentIssue?.courierId ?? order.deliveryWave?.courierUserId,
        courierName: couriers.find(user => user.id === (issue.paymentIssue?.courierId ?? order.deliveryWave?.courierUserId))?.name ?? null,
        expected: issue.paymentIssue?.expectedAmount.toFixed(2) ?? b.payable.toFixed(2), collected: issue.paymentIssue?.collectedAmount.toFixed(2) ?? b.collected.toFixed(2),
        variance: issue.paymentIssue?.variance.toFixed(2) ?? b.collected.minus(b.payable).toFixed(2) };
    });
  }
  async audit(orderId: string) {
    return this.prisma.operationalAudit.findMany({ where: { entityId: orderId }, include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } });
  }
  async settings(value: unknown, actor: StaffUser) {
    const body = object(value); const note = text(body.note, "Причина изменения");
    const rate = decimal(body.serviceFeePercent, 2, "Процент сбора");
    if (rate.gt(100) || typeof body.keepCustomerFees !== "boolean") throw new BadRequestException("Проверьте настройки.");
    const keepCustomerFees = body.keepCustomerFees;
    return this.finance.transaction(async tx => {
      await this.finance.actor(tx, actor, true);
      for (const [key, value] of [["service_fee_percent", rate.toFixed(2)], ["customer_refusal_keep_fees", keepCustomerFees]] as const) await tx.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
      await tx.operationalAudit.create({ data: { userId: actor.id, action: "finance.policy_updated", entityId: "delivery_policy", details: { note, rate: rate.toFixed(2), keepCustomerFees } } });
      return { success: true };
    });
  }
  async reschedule(id: string, value: unknown, actor: StaffUser) {
    const body = object(value); const slotId = text(body.deliverySlotId, "Новое окно"); const note = text(body.note, "Причина переноса");
    return this.finance.transaction(async tx => {
      await this.finance.actor(tx, actor, true);
      const order = await tx.order.findUnique({ where: { id }, include: financeInclude });
      if (!order) throw new NotFoundException();
      for (const slot of [order.deliverySlotId, slotId].sort()) await tx.$queryRaw`SELECT id FROM delivery_slots WHERE id = ${slot} FOR UPDATE`;
      if (order.deliveryClosedAt || !["out_for_delivery", "pending_review"].includes(order.status) || order.cashTransactions.length || order.issues.some(issue => issue.applied)) throw new ConflictException("Перенос возможен до оплаты/корректировок и закрытия доставки.");
      if (body.version !== order.financialVersion) throw new ConflictException("Заказ изменился. Обновите страницу.");
      if (!(await readSlot(tx, slotId))?.available) throw new ConflictException("Новое окно недоступно.");
      const pending = order.status === "pending_review";
      const wave = pending ? null : await tx.deliveryWave.upsert({ where: { deliverySlotId: slotId }, create: { deliverySlotId: slotId, ...await defaultAssignments(tx) }, update: {} });
      // Goods already packed: re-use the wave's delivery stage, do not procure them twice.
      await tx.order.update({ where: { id }, data: { deliverySlotId: slotId, deliveryWaveId: wave?.id ?? null, status: pending ? "pending_review" : "picked", requiresPicking: pending, financialVersion: { increment: 1 } } });
      if (order.deliveryWaveId && !await tx.order.count({ where: { deliveryWaveId: order.deliveryWaveId, status: { notIn: ["delivered", "cancelled"] } } })) await tx.deliveryWave.update({ where: { id: order.deliveryWaveId }, data: { status: "delivered" } });
      await tx.operationalAudit.create({ data: { userId: actor.id, action: "delivery.rescheduled", entityId: id, details: { note, fromSlot: order.deliverySlotId, toSlot: slotId } } });
      return { success: true };
    });
  }
}
