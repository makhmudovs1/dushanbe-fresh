import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma, OrderStatus, OrderItemStatus } from "@prisma/client";

export const orderTransitions: Record<OrderStatus, OrderStatus[]> = {
  draft: ["placed", "cancelled"], placed: ["confirmed", "cancelled"],
  confirmed: ["picking", "cancelled"], picking: ["picked", "cancelled"],
  picked: ["out_for_delivery", "cancelled"], out_for_delivery: ["delivered", "cancelled"], delivered: [], cancelled: []
};
export const waveTransitions: Record<string, string[]> = {
  open: ["picking", "cancelled"], picking: ["picked", "cancelled"],
  picked: ["out_for_delivery", "cancelled"], out_for_delivery: ["delivered"], delivered: [], cancelled: []
};
export function transition(from: string, to: string, rules: Record<string, string[]>) {
  if (from !== to && !rules[from]?.includes(to)) throw new ConflictException("Недопустимый переход статуса.");
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("Некорректные данные.");
  return value as Record<string, unknown>;
}
export function text(value: unknown, label: string, optional = false, max = 500): string {
  if (optional && (value === undefined || value === null)) return "";
  if (typeof value !== "string" || (!optional && !value.trim()) || value.trim().length > max) throw new BadRequestException(`Проверьте поле «${label}».`);
  return value.trim();
}
export function decimal(value: unknown, precision: 2 | 3, label: string) {
  if (typeof value !== "string" || !(precision === 2 ? /^\d{1,10}(\.\d{1,2})?$/ : /^\d{1,6}(\.\d{1,3})?$/).test(value)) {
    throw new BadRequestException(`Проверьте поле «${label}»: требуется неотрицательное десятичное число.`);
  }
  return new Prisma.Decimal(value);
}
export function money(value: Prisma.Decimal) {
  const result = value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (result.abs().gt("9999999999.99")) throw new BadRequestException("Сумма слишком велика.");
  return result;
}

export function purchaseNeedsReview(actual: Prisma.Decimal | null, reference: Prisma.Decimal | null, threshold: Prisma.Decimal) {
  if (actual === null) return false;
  if (reference === null) return false;
  return actual.minus(reference).abs().mul(100).gt(reference.mul(threshold));
}

export function purchaseReviewMessage(actual: Prisma.Decimal | null, reference: Prisma.Decimal | null, threshold: Prisma.Decimal) {
  if (!purchaseNeedsReview(actual, reference, threshold) || actual === null || reference === null) return null;
  if (reference.isZero()) return "Цена закупки выше нулевого ориентира. Нужна проверка администратора.";
  const percent = actual.minus(reference).abs().mul(100).div(reference).toDecimalPlaces(2).toString();
  return `Цена закупки ${actual.gt(reference) ? "выше" : "ниже"} ориентира на ${percent}%. Нужна проверка администратора.`;
}
export function dateFilter(value?: string) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(value).getTime()) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new BadRequestException("Некорректная дата.");
  }
  return new Date(value);
}

export type DemandItem = { productId: string; productNameSnapshot: string; unit: string; requestedQuantity: Prisma.Decimal;
  orderId: string; qualityOptionLabelSnapshot: string | null };
export function aggregateDemand(items: DemandItem[]) {
  const groups = new Map<string, { productId: string; name: string; unit: string; quantity: Prisma.Decimal;
    orders: Set<string>; quality: Map<string, Prisma.Decimal> }>();
  for (const item of items) {
    const group = groups.get(item.productId) ?? { productId: item.productId, name: item.productNameSnapshot,
      unit: item.unit, quantity: new Prisma.Decimal(0), orders: new Set<string>(), quality: new Map<string, Prisma.Decimal>() };
    if (group.unit !== item.unit) throw new ConflictException("Единицы товара в заказах различаются. Проверьте каталог и заказы.");
    group.quantity = group.quantity.plus(item.requestedQuantity);
    if (group.quantity.gt("999999999.999")) throw new BadRequestException("Слишком большое количество для одной волны.");
    group.orders.add(item.orderId);
    const label = item.qualityOptionLabelSnapshot ?? "Без предпочтения";
    group.quality.set(label, (group.quality.get(label) ?? new Prisma.Decimal(0)).plus(item.requestedQuantity));
    groups.set(item.productId, group);
  }
  return [...groups.values()];
}

export function finalOrderTotal(items: Array<{ status: OrderItemStatus; finalTotal: Prisma.Decimal | null }>,
  fees: { deliveryFee: Prisma.Decimal; serviceFee: Prisma.Decimal; discountTotal: Prisma.Decimal }) {
  if (!items.length || items.some(item => item.status === "requested" || item.finalTotal === null)) return null;
  const subtotal = items.reduce((sum, item) => sum.plus(item.finalTotal!), new Prisma.Decimal(0));
  return money(Prisma.Decimal.max(0, subtotal.plus(fees.deliveryFee).plus(fees.serviceFee).minus(fees.discountTotal)));
}
