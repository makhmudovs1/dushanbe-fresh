import { Prisma } from "@prisma/client";
import { aggregateDemand } from "./operations.rules";

export async function refreshDemand(tx: Prisma.TransactionClient, id: string) {
  const orders = await tx.order.findMany({ where: { deliveryWaveId: id, status: { not: "cancelled" } }, include: { items: true } });
  const groups = aggregateDemand(orders.flatMap(order => order.items));
  // Preserve procurement history when an order is cancelled or new orders arrive.
  await tx.waveItem.updateMany({ where: { deliveryWaveId: id }, data: { requestedQuantityTotal: "0" } });
  for (const group of groups) {
    const product = await tx.product.findUniqueOrThrow({ where: { id: group.productId } });
    await tx.waveItem.upsert({ where: { deliveryWaveId_productId: { deliveryWaveId: id, productId: group.productId } },
      update: { requestedQuantityTotal: group.quantity }, create: { deliveryWaveId: id, productId: group.productId,
        requestedQuantityTotal: group.quantity, productNameSnapshot: group.name, unit: group.unit,
        referencePurchasePrice: product.currentPurchasePrice } });
  }
}
