import type { CustomerOrderStatus, PublicOrderDto, PublicOrderMoney } from "@dushanbe-fresh/shared";
import { Prisma, type OrderStatus } from "@prisma/client";
import { balance, D, removedLineValue, sum } from "../delivery-finance/calculator";

const baseInclude = {
  deliverySlot: true,
  items: { include: { replacementProduct: { select: { name: true } } } },
  adjustments: true,
  cashTransactions: { select: { amount: true } },
  issues: { include: { items: true, replacement: { select: { prepaid: true } } }, orderBy: { createdAt: "asc" as const } }
} as const;
export const publicOrderInclude = {
  ...baseInclude,
  replacements: { include: { fulfillmentOrder: { include: baseInclude } }, orderBy: { createdAt: "asc" as const } }
} as const;
type Order = Prisma.OrderGetPayload<{ include: typeof baseInclude }>;
export type TrackingOrder = Prisma.OrderGetPayload<{ include: typeof publicOrderInclude }>;

const lifecycle: Record<OrderStatus, CustomerOrderStatus> = {
  draft: "order_received", placed: "order_received", pending_review: "needs_attention",
  confirmed: "order_received", picking: "preparing", picked: "packed",
  out_for_delivery: "out_for_delivery", delivered: "delivered", cancelled: "cancelled"
};
export function customerStatus(order: Pick<Order, "status"> & { issues: { status: string }[] }, hasReplacement = false): CustomerOrderStatus {
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "pending_review" || order.issues.some(issue => ["open", "awaiting_admin"].includes(issue.status))) return "needs_attention";
  if (hasReplacement) return "replacement_scheduled";
  return lifecycle[order.status];
}
const slot = (value: Order["deliverySlot"]) => ({ date: value.date.toISOString().slice(0, 10), startsAt: value.startsAt.toISOString().slice(11, 16), endsAt: value.endsAt.toISOString().slice(11, 16) });

const adjustmentLabels = {
  goods_removed: "Исключённые товары", service_fee_reduction: "Уменьшение сервисного сбора",
  service_fee_waiver: "Отмена сервисного сбора", delivery_fee_waiver: "Отмена платы за доставку",
  admin_compensation: "Компенсация", correction: "Корректировка суммы"
};
export function publicMoney(order: Order): PublicOrderMoney {
  const b = balance(order);
  return {
    goods: b.originalGoods.toFixed(2), serviceFee: order.serviceFee.toFixed(2), deliveryFee: order.deliveryFee.toFixed(2), discount: order.discountTotal.toFixed(2),
    original: b.original.toFixed(2), payable: b.payable.toFixed(2), collected: b.collected.toFixed(2), amountToCollect: b.amountToCollect.toFixed(2), refundDue: b.refundDue.toFixed(2),
    adjustments: order.adjustments.map(item => ({ label: adjustmentLabels[item.type], amount: item.amount.toFixed(2) }))
  };
}
function lines(order: Order) {
  return order.items.map(item => {
    // Paid replacements keep the original charge; unpaid replacements remove it from this order.
    let used = new D(0); let excluded = new D(0); let removed = new D(0);
    for (const issue of order.issues.filter(issue => issue.applied)) {
      const affected = sum(issue.items.filter(line => line.orderItemId === item.id).map(line => line.quantityAffected));
      if (!issue.replacement?.prepaid && order.adjustments.some(a => a.deliveryIssueId === issue.id && a.type === "goods_removed")) {
        removed = removed.plus(removedLineValue(item.finalUnitPrice ?? item.saleUnitPriceSnapshot, used, affected));
        excluded = excluded.plus(affected);
      }
      used = used.plus(affected);
    }
    const quantity = item.finalQuantity ?? item.requestedQuantity;
    return { name: item.replacementProduct?.name ?? item.productNameSnapshot, unit: item.unit,
      quantity: D.max(0, quantity.minus(excluded)).toFixed(3), total: D.max(0, (item.finalTotal ?? item.estimatedTotal).minus(removed)).toFixed(2) };
  });
}
export function mapPublicOrder(order: TrackingOrder): PublicOrderDto {
  const hasReplacement = order.replacements.some(item => !["delivered", "cancelled"].includes(item.fulfillmentOrder.status));
  const status = customerStatus(order, hasReplacement);
  const raw = order.deliveryAddressSnapshot;
  const address = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const field = (key: string) => typeof address[key] === "string" ? address[key] as string : "";
  return {
    orderNumber: order.orderNumber, status,
    progress: ({ picking: 1, picked: 2, out_for_delivery: 3, delivered: 4 } as Partial<Record<OrderStatus, number>>)[order.status] ?? 0,
    message: status === "needs_attention" ? "По заказу требуется уточнение. Мы свяжемся с вами." : null,
    deliverySlot: slot(order.deliverySlot),
    address: { city: field("city"), street: field("street"), building: field("building"), apartment: field("apartment"), entrance: field("entrance"), floor: field("floor") },
    items: lines(order), money: publicMoney(order),
    replacements: order.replacements.map(replacement => ({
      orderNumber: replacement.fulfillmentOrder.orderNumber, status: customerStatus(replacement.fulfillmentOrder),
      deliverySlot: slot(replacement.fulfillmentOrder.deliverySlot), items: lines(replacement.fulfillmentOrder),
      money: publicMoney(replacement.fulfillmentOrder), prepaid: replacement.prepaid
    }))
  };
}
