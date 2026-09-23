import { Prisma } from "@prisma/client";
import type { AdminOrder, AdminWave, StaffDto, WaveStatus } from "@dushanbe-fresh/shared";
import { slotDto } from "../delivery-slots/delivery-slots.service";
import { aggregateDemand, money, purchaseReviewMessage } from "./operations.rules";

export const orderInclude = { deliverySlot: true, items: { orderBy: { id: "asc" as const }, include: { replacementProduct: true } } } as const;
export const waveInclude = { deliverySlot: true, picker: true, courier: true,
  orders: { orderBy: { createdAt: "asc" as const }, include: orderInclude },
  waveItems: { orderBy: { productNameSnapshot: "asc" as const } } } as const;
type Order = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
export type Wave = Prisma.DeliveryWaveGetPayload<{ include: typeof waveInclude }>;

export function mapOrder(order: Order): AdminOrder {
  return { id: order.id, orderNumber: order.orderNumber, createdAt: order.createdAt.toISOString(), status: order.status,
    address: order.deliveryAddressSnapshot as AdminOrder["address"], deliverySlot: slotDto(order.deliverySlot, 0),
    deliveryWaveId: order.deliveryWaveId, substitutionPolicy: order.substitutionPolicy,
    customerComment: order.customerComment, qualityComment: order.qualityComment,
    paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus,
    itemsSubtotal: order.itemsSubtotal.toFixed(2), deliveryFee: order.deliveryFee.toFixed(2), serviceFee: order.serviceFee.toFixed(2),
    discountTotal: order.discountTotal.toFixed(2), totalEstimated: order.totalEstimated.toFixed(2), totalFinal: order.totalFinal?.toFixed(2) ?? null,
    items: order.items.map(item => ({ id: item.id, productId: item.productId, name: item.productNameSnapshot, unit: item.unit,
      requestedQuantity: item.requestedQuantity.toString(), qualityPreference: item.qualityOptionLabelSnapshot,
      estimatedPrice: item.saleUnitPriceSnapshot.toFixed(2), estimatedTotal: item.estimatedTotal.toFixed(2),
      finalQuantity: item.finalQuantity?.toString() ?? null, finalUnitPrice: item.finalUnitPrice?.toFixed(2) ?? null,
      finalTotal: item.finalTotal?.toFixed(2) ?? null, status: item.status, pickerNote: item.pickerNote,
      replacementProductId: item.replacementProductId, replacementName: item.replacementProduct?.name ?? null })) };
}

export function mapWave(wave: Wave, threshold = new Prisma.Decimal(15)): AdminWave {
  const activeOrders = wave.orders.filter(order => order.status !== "cancelled");
  const demand = aggregateDemand(activeOrders.flatMap(order => order.items));
  const items = activeOrders.flatMap(order => order.items);
  const estimated = activeOrders.reduce((sum, order) => sum.plus(order.itemsSubtotal), new Prisma.Decimal(0));
  const complete = activeOrders.length > 0 && activeOrders.every(order => order.totalFinal !== null);
  const revenue = complete ? money(items.reduce((sum, item) => sum.plus(item.finalTotal ?? 0), new Prisma.Decimal(0))) : null;
  const cost = wave.waveItems.length && wave.waveItems.every(item => item.purchaseTotal !== null)
    ? money(wave.waveItems.reduce((sum, item) => sum.plus(item.purchaseTotal!), new Prisma.Decimal(0))) : null;
  const staff = (user: Wave["picker"]): StaffDto | null => user ? { id: user.id, name: user.name, role: user.role as StaffDto["role"] } : null;
  return { id: wave.id, status: wave.status as WaveStatus, deliverySlot: slotDto(wave.deliverySlot, 0), picker: staff(wave.picker), courier: staff(wave.courier),
    orders: wave.orders.map(mapOrder), purchasePriceDeviationPercent: threshold.toString(),
    pickingList: wave.waveItems.map(item => {
      const group = demand.find(group => group.productId === item.productId);
      const allocated = items.filter(line => (line.replacementProductId ?? line.productId) === item.productId && ["picked", "replaced"].includes(line.status))
        .reduce((sum, line) => sum.plus(line.finalQuantity ?? 0), new Prisma.Decimal(0));
      const review = item.purchasedQuantity?.gt(0) ? purchaseReviewMessage(item.purchaseUnitPrice, item.referencePurchasePrice, threshold) : null;
      return { id: item.id, productId: item.productId, name: item.productNameSnapshot, unit: item.unit,
        requestedQuantityTotal: item.requestedQuantityTotal.toString(), orderCount: group?.orders.size ?? 0,
        qualityPreferences: [...(group?.quality ?? [])].map(([label, quantity]) => ({ label, quantity: quantity.toString() })),
        purchasedQuantity: item.purchasedQuantity?.toString() ?? null, purchaseUnitPrice: item.purchaseUnitPrice?.toFixed(2) ?? null,
        referencePurchasePrice: item.referencePurchasePrice?.toFixed(2) ?? null,
        purchaseNeedsReview: review !== null, purchaseReviewMessage: review,
        purchaseTotal: item.purchaseTotal?.toFixed(2) ?? null, allocatedQuantity: allocated.toString(),
        remainingQuantity: item.purchasedQuantity?.minus(allocated).toString() ?? null, supplierNote: item.supplierNote };
    }),
    metrics: { orderCount: activeOrders.length, productCount: wave.waveItems.length, estimatedRevenue: estimated.toFixed(2),
      finalRevenue: revenue?.toFixed(2) ?? null, purchaseCost: cost?.toFixed(2) ?? null,
      grossMargin: revenue && cost ? revenue.minus(cost).toFixed(2) : null } };
}
