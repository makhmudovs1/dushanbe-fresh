import type { PrismaClient } from "@prisma/client";

export function assertLocalDevelopment(env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV && !["development", "test"].includes(env.NODE_ENV)) throw new Error("Operational dev scripts are forbidden outside development/test.");
  const url = new URL(env.DATABASE_URL ?? "");
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Operational dev scripts require a local PostgreSQL database.");
  }
}

export async function resetOperations(db: PrismaClient, env: NodeJS.ProcessEnv, confirmed: boolean) {
  assertLocalDevelopment(env);
  if (!confirmed) throw new Error("This deletes ALL orders and waves in the local dev database. Run with --confirm. Catalog, staff, settings and slots are preserved.");
  return db.$transaction(async tx => {
    const ordersBefore = await tx.order.findMany({ select: { id: true } });
    const wavesBefore = await tx.deliveryWave.findMany({ select: { id: true } });
    const shiftsBefore = await tx.courierShift.findMany({ select: { id: true } });
    await tx.operationalAudit.deleteMany({ where: { entityId: { in: [...ordersBefore, ...wavesBefore, ...shiftsBefore].map(row => row.id) } } });
    await tx.cashTransaction.deleteMany();
    await tx.courierShift.deleteMany();
    await tx.paymentIssue.deleteMany();
    await tx.orderFinancialAdjustment.deleteMany();
    await tx.replacementDelivery.deleteMany();
    await tx.deliveryIssueItem.deleteMany();
    await tx.deliveryIssue.deleteMany();
    await tx.deliveryAttempt.deleteMany();
    const items = await tx.orderItem.deleteMany();
    const orders = await tx.order.deleteMany();
    const purchases = await tx.waveItem.deleteMany();
    const waves = await tx.deliveryWave.deleteMany();
    await tx.customer.updateMany({ data: { confirmedCustomerFaultIncidents: 0, unpaidIncidents: 0 } });
    return { orderItems: items.count, orders: orders.count, waveItems: purchases.count, waves: waves.count };
  });
}
