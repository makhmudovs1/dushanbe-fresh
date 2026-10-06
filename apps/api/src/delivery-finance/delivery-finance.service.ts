import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { CustomerVerification, IssueReason, IssueResolution, Prisma, Responsibility, ReviewStatus } from "@prisma/client";
import type { StaffUser } from "@dushanbe-fresh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { assertAssignment, isAdmin } from "../operations/operations.access";
import { staffDto, staffSelect } from "../auth/auth.service";
import { decimal, money, object, text } from "../operations/operations.rules";
import { readSlot } from "../delivery-slots/delivery-slots.service";
import { attachConfirmedOrders } from "../operations/operations.defaults";
import { balance, D, financeInclude, FinancialOrder, planRemoval, sum } from "./calculator";

type Tx = Prisma.TransactionClient;
const serial = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function choice<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new BadRequestException(`Проверьте поле «${label}».`);
  return value as T;
}

@Injectable()
export class DeliveryFinanceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async transaction<T>(run: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
      try { return await this.prisma.$transaction(run, { isolationLevel: "Serializable", timeout: 20000 }); }
      catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && (["P2034", "P2002"].includes(error.code) || error.code === "P2010" && ["40001", "40P01"].includes(String(error.meta?.code)))) {
          if (attempt < 3) continue;
          throw new ConflictException("Данные изменились. Обновите страницу и повторите действие.");
        }
        throw error;
      }
    }
    throw new ConflictException();
  }
  async actor(tx: Tx, actor: StaffUser, admin = false) {
    const user = await tx.user.findUnique({ where: { id: actor.id }, select: staffSelect });
    if (!user || user.status !== "active" || !user.roles.length || (admin && !user.roles.includes("admin"))) throw new ForbiddenException("Недостаточно прав.");
    return staffDto(user);
  }
  private async locked(tx: Tx, id: string, actor: StaffUser) {
    const ref = await tx.order.findUnique({ where: { id }, select: { deliverySlotId: true } });
    if (!ref) throw new NotFoundException("Заказ не найден.");
    await tx.$queryRaw`SELECT id FROM delivery_slots WHERE id = ${ref.deliverySlotId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
    const order = await tx.order.findUniqueOrThrow({ where: { id }, include: financeInclude });
    assertAssignment(order.deliveryWave, actor, "courier");
    return order;
  }
  private version(order: FinancialOrder, body: Record<string, unknown>) {
    if (!Number.isInteger(body.version) || body.version !== order.financialVersion) throw new ConflictException("Сумма или состояние заказа изменились. Обновите данные и подтвердите заново.");
  }
  private stage(order: FinancialOrder, actor: StaffUser) {
    if (!order.totalFinal || !["out_for_delivery", "delivered"].includes(order.status)) throw new ConflictException("Заказ ещё не передан в доставку.");
    if (!isAdmin(actor) && (order.deliveryClosedAt || order.cashTransactions.some(row => row.shift && row.shift.status !== "open"))) throw new ConflictException("Доставка или касса закрыта. Передайте обращение администратору.");
  }
  private async mutate(id: string, value: unknown, actor: StaffUser, action: string, run: (tx: Tx, order: FinancialOrder, body: Record<string, unknown>, actor: StaffUser) => Promise<void>, admin = false) {
    const body = object(value);
    const requestId = text(body.requestId, "Номер операции", false, 100);
    const requestHash = createHash("sha256").update(JSON.stringify({ action, body })).digest("hex");
    return this.transaction(async tx => {
      actor = await this.actor(tx, actor, admin);
      const order = await this.locked(tx, id, actor);
      const previous = await tx.operationalAudit.findFirst({ where: { entityId: id, details: { path: ["requestId"], equals: requestId } } });
      if (previous) {
        if ((previous.details as { requestHash?: string }).requestHash !== requestHash || previous.userId !== actor.id) throw new ConflictException("Номер операции уже использован с другими данными.");
        return this.view(await tx.order.findUniqueOrThrow({ where: { id }, include: financeInclude }), actor);
      }
      this.version(order, body);
      if (isAdmin(actor)) text(body.note, "Причина действия администратора");
      await run(tx, order, body, actor);
      await tx.order.update({ where: { id }, data: { financialVersion: { increment: 1 } } });
      const next = await tx.order.findUniqueOrThrow({ where: { id }, include: financeInclude });
      const b = balance(next);
      const before = balance(order);
      await tx.operationalAudit.create({ data: { userId: actor.id, entityId: id, action,
        details: { requestId, requestHash, note: String(body.note ?? ""), version: order.financialVersion,
          payableBefore: before.payable.toFixed(2), payableAfter: b.payable.toFixed(2),
          cashBefore: before.collected.toFixed(2), cashAfter: b.collected.toFixed(2) } } });
      const reported = next.cashTransactions.some(item => item.type === "collection") || next.legacyPaidAmount.gt(0);
      const paymentStatus = b.refundDue.gt(0) ? "partial" : b.amountToCollect.isZero() ? "paid" : reported ? b.collected.gt(0) ? "partial" : "unpaid" : "pending";
      await tx.order.update({ where: { id }, data: { paymentStatus } });
      return this.view({ ...next, paymentStatus }, actor);
    });
  }
  private view(order: FinancialOrder, actor: StaffUser) {
    const b = balance(order);
    return serial({ id: order.id, orderNumber: order.orderNumber, status: order.status, paymentStatus: order.paymentStatus, customerId: isAdmin(actor) ? order.customerId : undefined,
      outcome: order.fulfillmentOutcome, version: order.financialVersion, closedAt: order.deliveryClosedAt,
      originalCheckoutTotal: order.totalEstimated.toFixed(2), originalPackedTotal: b.original.toFixed(2), goods: b.originalGoods.toFixed(2),
      serviceFee: order.serviceFee.toFixed(2), deliveryFee: order.deliveryFee.toFixed(2), discountTotal: order.discountTotal.toFixed(2),
      adjustmentTotal: b.changes.toFixed(2), payable: b.payable.toFixed(2), collected: b.collected.toFixed(2), amountToCollect: b.amountToCollect.toFixed(2), refundDue: b.refundDue.toFixed(2),
      canAct: !order.deliveryClosedAt && ["out_for_delivery", "delivered"].includes(order.status) && !order.cashTransactions.some(row => row.shift && row.shift.status !== "open"),
      collectionReported: order.cashTransactions.some(row => row.type === "collection") || order.legacyPaidAmount.gt(0),
      items: order.items.map(item => {
        const removed = sum(order.issues.filter(issue => issue.applied).flatMap(issue => issue.items.filter(line => line.orderItemId === item.id).map(line => line.quantityAffected)));
        const quantity = item.finalQuantity ?? item.requestedQuantity;
        return { id: item.id, name: item.productNameSnapshot, unit: item.unit, quantity: quantity.toString(),
          price: (item.finalUnitPrice ?? item.saleUnitPriceSnapshot).toFixed(2), removed: removed.toString(), remaining: quantity.minus(removed).toString() };
      }),
      adjustments: order.adjustments.map(row => ({ ...row, amount: row.amount.toFixed(2) })), issues: order.issues.map(issue => isAdmin(actor) ? issue : { id: issue.id, reason: issue.reason, status: issue.status, resolution: issue.resolution, note: issue.note, items: issue.items }),
      attempts: order.attempts, replacements: order.replacements, cash: order.cashTransactions.map(row => ({ id: row.id, type: row.type, amount: row.amount.toFixed(2), note: row.note, createdAt: row.createdAt }))
    });
  }
  async get(id: string, actor: StaffUser) {
    return this.transaction(async tx => { actor = await this.actor(tx, actor); return this.view(await this.locked(tx, id, actor), actor); });
  }
  private async keepFees(tx: Tx) {
    const setting = await tx.appSetting.findUnique({ where: { key: "customer_refusal_keep_fees" } });
    return setting?.value !== false;
  }
  async preview(id: string, value: unknown, actor: StaffUser) {
    return this.transaction(async tx => {
      actor = await this.actor(tx, actor); const order = await this.locked(tx, id, actor);
      this.stage(order, actor); const body = object(value); this.version(order, body);
      const plan = planRemoval(order, body, await this.keepFees(tx));
      const b = balance(order); const payable = money(D.max(0, b.payable.plus(sum(plan.adjustments.map(a => a.amount)))));
      return { version: order.financialVersion, before: b.payable.toFixed(2), after: payable.toFixed(2),
        adjustments: plan.adjustments.map(a => ({ type: a.type, amount: a.amount.toFixed(2) })),
        refund: money(D.max(0, b.collected.minus(payable))).toFixed(2), replacementDue: plan.prepaid ? "0.00" : plan.removed.toFixed(2),
        requiresAdmin: !plan.service };
    });
  }
  async issue(id: string, value: unknown, actor: StaffUser) {
    return this.mutate(id, value, actor, "delivery.issue_created", async (tx, order, body, user) => {
      this.stage(order, user);
      for (const field of ["amount", "refund", "price", "sellingPrice", "responsibility"]) if (body[field] !== undefined) throw new BadRequestException("Ответственность и суммы определяются системой или проверкой администратора.");
      const reason = choice(body.reason, Object.values(IssueReason), "Причина");
      const resolution = choice(body.resolution, Object.values(IssueResolution), "Решение");
      const financial = ["accept_rest_remove_items", "full_refusal", "replacement_later"].includes(resolution);
      const plan = financial ? planRemoval(order, body, await this.keepFees(tx)) : null;
      const issue = await tx.deliveryIssue.create({ data: { orderId: id, createdByUserId: user.id, requestId: String(body.requestId), reason, resolution,
        responsibility: plan?.service ? "service" : "unknown", status: plan?.service || reason === "price_dispute" && body.customerAgreed === true ? "resolved" : "awaiting_admin",
        reviewStatus: "pending", applied: !!plan, note: text(body.note, "Примечание", true),
        items: plan ? { create: plan.items.map(line => ({ orderItemId: line.orderItemId, quantityAffected: line.quantityAffected })) } : undefined } });
      if (plan) {
        for (const adjustment of plan.adjustments) await tx.orderFinancialAdjustment.create({ data: { ...adjustment, orderId: id, deliveryIssueId: issue.id, requestId: issue.id, createdByUserId: user.id, reason } });
        await tx.order.update({ where: { id }, data: { fulfillmentOutcome: plan.outcome } });
        if (resolution === "replacement_later") await this.replacement(tx, order, issue.id, plan, text(body.deliverySlotId, "Окно замены"), user.id);
      }
      if (["customer_unreachable", "customer_not_home", "wrong_address"].includes(reason)) {
        const nextAction = choice(body.nextAction ?? "escalate_to_admin", ["retry_same_wave", "request_new_slot", "escalate_to_admin"], "Следующий шаг");
        const proposedSlotId = nextAction === "request_new_slot" ? text(body.deliverySlotId, "Предлагаемое окно") : null;
        const proposed = proposedSlotId ? await readSlot(tx, proposedSlotId) : null;
        if (proposedSlotId && !proposed?.available) throw new ConflictException("Выбранное окно недоступно.");
        const labels = { retry_same_wave: "повторить в этой волне", request_new_slot: "предложить новое окно", escalate_to_admin: "передать администратору" };
        const note = `${issue.note}\nСледующий шаг: ${labels[nextAction]}${proposed ? `, ${proposed.date} ${proposed.startsAt}–${proposed.endsAt}` : ""}.`;
        await tx.deliveryIssue.update({ where: { id: issue.id }, data: { note } });
        await tx.deliveryAttempt.create({ data: { orderId: id, courierId: order.deliveryWave!.courierUserId!, requestId: String(body.requestId), reason, note, nextAction, proposedSlotId } });
      }
    });
  }
  private async replacement(tx: Tx, order: FinancialOrder, issueId: string, plan: ReturnType<typeof planRemoval>, slotId: string, userId: string) {
    await tx.$queryRaw`SELECT id FROM delivery_slots WHERE id = ${slotId} FOR UPDATE`;
    if (!(await readSlot(tx, slotId))?.available) throw new ConflictException("Окно замены недоступно или заполнено.");
    const number = await tx.replacementDelivery.count({ where: { originalOrderId: order.id } });
    const goods = plan.prepaid ? new D(0) : sum(plan.items.map(({ item, quantityAffected }) => money(quantityAffected.mul(item.finalUnitPrice ?? item.saleUnitPriceSnapshot))));
    const recovery = await tx.order.create({ data: {
      orderNumber: `${order.orderNumber}-R${number + 1}`, orderKind: "service_recovery", customerId: order.customerId,
      deliveryAddressSnapshot: order.deliveryAddressSnapshot!, deliverySlotId: slotId, substitutionPolicy: order.substitutionPolicy,
      status: "confirmed", itemsSubtotal: goods, serviceFee: "0", deliveryFee: "0", totalEstimated: goods,
      items: { create: plan.items.map(({ item, quantityAffected }) => ({ productId: item.replacementProductId ?? item.productId, productNameSnapshot: item.productNameSnapshot,
        unit: item.unit, requestedQuantity: quantityAffected, saleUnitPriceSnapshot: plan.prepaid ? "0" : item.finalUnitPrice ?? item.saleUnitPriceSnapshot,
        estimatedTotal: plan.prepaid ? "0" : money(quantityAffected.mul(item.finalUnitPrice ?? item.saleUnitPriceSnapshot)), qualityOptionLabelSnapshot: item.qualityOptionLabelSnapshot })) }
    } });
    // Cumulative refusals can round differently from a new line. Preserve the exact transferred debt.
    const rounding = plan.prepaid ? new D(0) : plan.removed.minus(goods);
    if (!rounding.isZero()) {
      const reason = "Округление перенесённой стоимости замены";
      await tx.orderFinancialAdjustment.create({ data: { orderId: recovery.id, type: "correction", amount: rounding, createdByUserId: userId, requestId: `rounding:${issueId}`, reason } });
      await tx.operationalAudit.create({ data: { userId, entityId: recovery.id, action: "finance.replacement_rounding", details: { note: reason, payableBefore: goods.toFixed(2), payableAfter: plan.removed.toFixed(2) } } });
    }
    await tx.replacementDelivery.create({ data: { originalOrderId: order.id, deliveryIssueId: issueId, fulfillmentOrderId: recovery.id, prepaid: plan.prepaid } });
    await attachConfirmedOrders(tx, slotId);
  }
  private async shift(tx: Tx, courierId: string) {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${courierId} FOR UPDATE`;
    return await tx.courierShift.findFirst({ where: { courierId, status: "open" } }) ?? tx.courierShift.create({ data: { courierId } });
  }
  private async close(tx: Tx, order: FinancialOrder) {
    await tx.order.update({ where: { id: order.id }, data: { status: "delivered", deliveryClosedAt: new Date() } });
    if (order.deliveryWaveId && !await tx.order.count({ where: { deliveryWaveId: order.deliveryWaveId, id: { not: order.id }, status: { notIn: ["delivered", "cancelled"] } } })) {
      await tx.deliveryWave.update({ where: { id: order.deliveryWaveId }, data: { status: "delivered" } });
    }
  }
  async collect(id: string, value: unknown, actor: StaffUser) {
    return this.mutate(id, value, actor, "cash.collection", async (tx, order, body, user) => {
      this.stage(order, user);
      if (order.cashTransactions.some(row => row.type === "collection") || order.legacyPaidAmount.gt(0)) throw new ConflictException("Оплата уже зафиксирована. Дополнительные изменения выполняет администратор.");
      const b = balance(order); const mode = choice(body.mode, ["full", "unpaid", "partial"], "Оплата");
      if (mode !== "partial" && body.amount !== undefined) throw new BadRequestException("Сумма полной оплаты определяется системой.");
      const amount = mode === "full" ? b.amountToCollect : mode === "unpaid" ? new D(0) : decimal(body.amount, 2, "Фактически получено");
      if (amount.gt(b.amountToCollect) || (mode === "partial" && (amount.lte(0) || amount.eq(b.amountToCollect)))) throw new BadRequestException("Частичная оплата должна быть больше нуля и меньше ожидаемой суммы.");
      const note = text(body.note, "Причина расхождения", mode === "full");
      const courierId = order.deliveryWave?.courierUserId;
      if (!courierId) throw new ConflictException("Назначьте курьера.");
      const shift = await this.shift(tx, courierId);
      await tx.cashTransaction.create({ data: { orderId: id, courierId, shiftId: shift.id, createdByUserId: user.id, type: "collection", amount, expectedAmount: b.amountToCollect, requestId: String(body.requestId), note } });
      if (!amount.eq(b.amountToCollect)) {
        const issue = await tx.deliveryIssue.create({ data: { orderId: id, createdByUserId: user.id, requestId: `payment:${body.requestId}`, reason: "payment_problem", resolution: "payment_issue", note } });
        await tx.paymentIssue.create({ data: { orderId: id, courierId, deliveryIssueId: issue.id, expectedAmount: b.amountToCollect, collectedAmount: amount, variance: amount.minus(b.amountToCollect) } });
      }
      if (body.closeDelivery !== false) await this.close(tx, order);
    });
  }
  async refund(id: string, value: unknown, actor: StaffUser) {
    return this.mutate(id, value, actor, "cash.refund", async (tx, order, body, user) => {
      this.stage(order, user);
      if (body.amount !== undefined) throw new BadRequestException("Сумму возврата рассчитывает система.");
      if (order.deliveryClosedAt) throw new ConflictException("Доставка закрыта. Нужна корректировка администратора.");
      const b = balance(order); if (b.refundDue.lte(0)) throw new ConflictException("Возврат не требуется.");
      const collection = order.cashTransactions.find(row => row.type === "collection");
      if (!collection?.shift || collection.shift.status !== "open" || collection.courierId !== order.deliveryWave?.courierUserId) throw new ConflictException("Касса закрыта или деньги принимал другой курьер. Передайте администратору.");
      await tx.cashTransaction.create({ data: { orderId: id, courierId: collection.courierId, shiftId: collection.shift.id, createdByUserId: user.id, type: "cash_refund", amount: b.refundDue.negated(), requestId: String(body.requestId), note: text(body.note, "Причина возврата", true) || "Возврат по корректировкам заказа" } });
    });
  }
  async complete(id: string, value: unknown, actor: StaffUser) {
    return this.mutate(id, value, actor, "delivery.closed", async (tx, order, _body, user) => {
      this.stage(order, user);
      if (balance(order).refundDue.gt(0)) throw new ConflictException("Сначала зафиксируйте возврат или передайте вопрос администратору.");
      if (!order.cashTransactions.some(row => row.type === "collection") && order.legacyPaidAmount.isZero()) throw new ConflictException("Сначала зафиксируйте оплату или неоплату.");
      await this.close(tx, order);
    });
  }
  async adjustment(id: string, value: unknown, actor: StaffUser) {
    return this.mutate(id, value, actor, "finance.admin_adjustment", async (tx, order, body, user) => {
      this.stage(order, user);
      const type = choice(body.type, ["service_fee_waiver", "delivery_fee_waiver", "admin_compensation", "correction"], "Корректировка");
      const remaining = (fee: Prisma.Decimal, types: string[]) => D.max(0, fee.plus(sum(order.adjustments.filter(a => types.includes(a.type)).map(a => a.amount))));
      let amount = type === "service_fee_waiver" ? remaining(order.serviceFee, ["service_fee_waiver", "service_fee_reduction"]).negated()
        : type === "delivery_fee_waiver" ? remaining(order.deliveryFee, ["delivery_fee_waiver"]).negated() : decimal(body.amount, 2, "Сумма").negated();
      if (type === "correction" && body.direction === "increase") amount = amount.negated();
      if (amount.isZero() || balance(order).payable.plus(amount).lt(0)) throw new BadRequestException("Корректировка должна менять сумму и не делать её отрицательной.");
      await tx.orderFinancialAdjustment.create({ data: { orderId: id, type, amount, createdByUserId: user.id, requestId: String(body.requestId), reason: String(body.note) } });
    }, true);
  }
  async correctCash(id: string, value: unknown, actor: StaffUser) {
    return this.mutate(id, value, actor, "cash.admin_correction", async (tx, order, body, user) => {
      this.stage(order, user);
      const amount = decimal(body.amount, 2, "Фактическая корректировка").mul(body.direction === "decrease" ? -1 : 1);
      const b = balance(order);
      if (amount.isZero() || b.collected.plus(amount).lt(0) || b.collected.plus(amount).gt(b.payable) && amount.gt(0)) throw new BadRequestException("Корректировка превышает текущие расчёты.");
      const courierId = text(body.courierId, "Курьер");
      const courier = await tx.user.findFirst({ where: { id: courierId, roles: { has: "courier" } } });
      if (!courier) throw new BadRequestException("Курьер не найден.");
      const shift = await this.shift(tx, courierId);
      await tx.cashTransaction.create({ data: { orderId: id, courierId, shiftId: shift.id, type: "correction", amount, note: String(body.note), createdByUserId: user.id, requestId: String(body.requestId) } });
    }, true);
  }
  async review(issueId: string, value: unknown, actor: StaffUser) {
    const ref = await this.prisma.deliveryIssue.findUnique({ where: { id: issueId } });
    if (!ref) throw new NotFoundException();
    return this.mutate(ref.orderId, value, actor, "delivery.issue_reviewed", async (tx, order, body, user) => {
      const issue = order.issues.find(issue => issue.id === issueId)!;
      const responsibility = choice(body.responsibility, Object.values(Responsibility), "Ответственность");
      const reviewStatus = choice(body.reviewStatus, Object.values(ReviewStatus), "Результат проверки");
      const verification = choice(body.customerVerification, Object.values(CustomerVerification), "Ответ клиента");
      if (verification === "customer_disputed" && responsibility === "customer" && reviewStatus === "confirmed") throw new ConflictException("Клиент оспаривает данные. Сначала разберите противоречие; автоматическое обвинение недопустимо.");
      await tx.deliveryIssue.update({ where: { id: issueId }, data: { responsibility, reviewStatus, customerVerification: verification,
        status: verification === "customer_disputed" || reviewStatus === "pending" ? "awaiting_admin" : reviewStatus === "rejected" ? "rejected" : "resolved", reviewedAt: new Date(), reviewedByUserId: user.id, reviewNote: String(body.note) } });
      if (order.customerId) {
        const faults = await tx.deliveryIssue.findMany({ where: { order: { customerId: order.customerId }, responsibility: "customer", reviewStatus: "confirmed" }, select: { orderId: true, paymentIssue: { select: { id: true } } } });
        const confirmed = new Set(faults.map(row => row.orderId)).size;
        const unpaid = new Set(faults.filter(row => row.paymentIssue).map(row => row.orderId)).size;
        const customer = await tx.customer.findUniqueOrThrow({ where: { id: order.customerId } });
        await tx.customer.update({ where: { id: order.customerId }, data: { confirmedCustomerFaultIncidents: confirmed, unpaidIncidents: unpaid,
          riskStatus: customer.riskStatus === "restricted" ? "restricted" : confirmed >= 2 ? "watch" : "normal" } });
      }
      if (issue.applied && responsibility === "service" && reviewStatus === "confirmed" && issue.reason === "customer_changed_mind") {
        const remaining = balance(order);
        const full = ["refused", "service_failure"].includes(order.fulfillmentOutcome);
        const removed = sum(order.adjustments.filter(a => a.deliveryIssueId === issueId && a.type === "goods_removed").map(a => a.amount)).abs();
        const serviceRemaining = D.max(0, order.serviceFee.plus(sum(order.adjustments.filter(a => ["service_fee_waiver", "service_fee_reduction"].includes(a.type)).map(a => a.amount))));
        const alreadyReduced = sum(order.adjustments.filter(a => a.deliveryIssueId === issueId && ["service_fee_reduction", "service_fee_waiver"].includes(a.type)).map(a => a.amount)).abs();
        const service = full ? serviceRemaining : D.min(serviceRemaining, D.max(0, money(removed.mul(order.serviceFeePercentSnapshot ?? 0).div(100)).minus(alreadyReduced)));
        const delivery = full ? D.max(0, order.deliveryFee.plus(sum(order.adjustments.filter(a => a.type === "delivery_fee_waiver").map(a => a.amount)))) : new D(0);
        let budget = remaining.payable;
        for (const [type, value] of [["service_fee_reduction", service], ["delivery_fee_waiver", delivery]] as const) {
          const amount = D.min(value, budget); budget = budget.minus(amount);
          if (amount.gt(0)) await tx.orderFinancialAdjustment.create({ data: { orderId: order.id, deliveryIssueId: issueId, type, amount: amount.negated(), createdByUserId: user.id, requestId: String(body.requestId), reason: String(body.note) } });
        }
      }
    }, true);
  }
}
