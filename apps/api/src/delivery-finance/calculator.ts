import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma, type AdjustmentType } from "@prisma/client";
import { decimal, money, object, text } from "../operations/operations.rules";

export const financeInclude = {
  items: true, deliveryWave: true, adjustments: true, cashTransactions: { include: { shift: true } },
  issues: { include: { items: true, paymentIssue: true, replacement: true }, orderBy: { createdAt: "desc" as const } },
  attempts: { orderBy: { attemptedAt: "desc" as const } },
  replacements: { include: { fulfillmentOrder: { select: { id: true, orderNumber: true, status: true, deliverySlotId: true } } } },
  recovery: true
} as const;
export type FinancialOrder = Prisma.OrderGetPayload<{ include: typeof financeInclude }>;
export const D = Prisma.Decimal;
export const sum = (values: Prisma.Decimal[]) => values.reduce((total, value) => total.plus(value), new D(0));
export const removedLineValue = (price: Prisma.Decimal, used: Prisma.Decimal, quantity: Prisma.Decimal) => money(price.mul(used.plus(quantity))).minus(money(price.mul(used)));
export function balance(order: Pick<FinancialOrder, "totalFinal" | "totalEstimated" | "serviceFee" | "deliveryFee" | "discountTotal" | "legacyPaidAmount"> & {
  adjustments: { amount: Prisma.Decimal }[]; cashTransactions: { amount: Prisma.Decimal }[];
}) {
  const original = order.totalFinal ?? order.totalEstimated;
  const changes = sum(order.adjustments.map(item => item.amount));
  const payable = money(D.max(0, original.plus(changes)));
  const collected = money(order.legacyPaidAmount.plus(sum(order.cashTransactions.map(item => item.amount))));
  return { original, changes, payable, collected, amountToCollect: money(D.max(0, payable.minus(collected))), refundDue: money(D.max(0, collected.minus(payable))),
    originalGoods: original.minus(order.serviceFee).minus(order.deliveryFee).plus(order.discountTotal) };
}
export const automaticServiceReasons = ["quality_problem", "damaged_item", "wrong_item", "missing_item_or_quantity"];
export type PlannedAdjustment = { type: AdjustmentType; amount: Prisma.Decimal };
export function planRemoval(order: FinancialOrder, value: unknown, keepCustomerFees = true) {
  const body = object(value);
  const reason = text(body.reason, "Причина"); const resolution = text(body.resolution, "Решение");
  const service = automaticServiceReasons.includes(reason);
  if (!service && reason !== "customer_changed_mind") throw new BadRequestException("Для этой причины требуется решение администратора.");
  if (!Array.isArray(body.items) || !body.items.length) throw new BadRequestException("Выберите позиции и количество.");
  const selected = new Set<string>();
  const items = body.items.map(value => {
    const line = object(value); const id = text(line.orderItemId, "Позиция");
    const item = order.items.find(item => item.id === id);
    if (!item || selected.has(id) || item.finalQuantity === null || item.finalTotal === null || !["picked", "replaced"].includes(item.status)) throw new BadRequestException("Недопустимая позиция заказа.");
    selected.add(id);
    const quantity = decimal(line.quantityAffected, 3, "Количество");
    const used = sum(order.issues.filter(issue => issue.applied).flatMap(issue => issue.items.filter(line => line.orderItemId === id).map(line => line.quantityAffected)));
    if (quantity.lte(0) || used.plus(quantity).gt(item.finalQuantity)) throw new ConflictException("Количество превышает оставшееся количество позиции.");
    const price = item.finalUnitPrice ?? item.saleUnitPriceSnapshot;
    const removed = removedLineValue(price, used, quantity);
    return { orderItemId: id, quantityAffected: quantity, removed, item };
  });
  const full = order.items.filter(item => item.finalQuantity?.gt(0) && ["picked", "replaced"].includes(item.status)).every(item => {
    const used = sum(order.issues.filter(issue => issue.applied).flatMap(issue => issue.items.filter(line => line.orderItemId === item.id).map(line => line.quantityAffected)));
    return used.plus(items.find(line => line.orderItemId === item.id)?.quantityAffected ?? 0).eq(item.finalQuantity!);
  });
  if (resolution === "full_refusal" && !full) throw new BadRequestException("Для полного отказа выберите всё оставшееся количество.");
  const b = balance(order);
  const prepaid = b.amountToCollect.isZero() && b.collected.gt(0);
  if (resolution === "replacement_later" && (!service || (b.collected.gt(0) && !prepaid))) throw new ConflictException("Замену при спорной причине или частичной оплате согласует администратор.");
  const removed = money(sum(items.map(item => item.removed)));
  const adjustments: PlannedAdjustment[] = [];
  if (!(resolution === "replacement_later" && prepaid)) {
    adjustments.push({ type: "goods_removed", amount: removed.negated() });
    const serviceRemaining = D.max(0, order.serviceFee.plus(sum(order.adjustments.filter(a => ["service_fee_reduction", "service_fee_waiver"].includes(a.type)).map(a => a.amount))));
    const deliveryRemaining = D.max(0, order.deliveryFee.plus(sum(order.adjustments.filter(a => a.type === "delivery_fee_waiver").map(a => a.amount))));
    if (service || !keepCustomerFees) {
      // Full replacement still completes a service later, so only remove the affected goods' percentage fee.
      const waive = full && resolution !== "replacement_later";
      const reduction = waive ? serviceRemaining : order.serviceFeePercentSnapshot ? D.min(serviceRemaining, money(removed.mul(order.serviceFeePercentSnapshot).div(100))) : new D(0);
      if (reduction.gt(0)) adjustments.push({ type: waive ? "service_fee_waiver" : "service_fee_reduction", amount: reduction.negated() });
      if (waive && deliveryRemaining.gt(0)) adjustments.push({ type: "delivery_fee_waiver", amount: deliveryRemaining.negated() });
    }
  }
  return { items, adjustments, prepaid, service, full, removed,
    outcome: resolution === "replacement_later" ? "replacement_pending" as const : full ? service ? "service_failure" as const : "refused" as const : "partial" as const };
}
