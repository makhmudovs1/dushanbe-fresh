import type { PrismaClient } from "@prisma/client";

// Test fixtures only. Never call from a runtime API or use against a non-test schema.
export async function clearTestFinances(db: PrismaClient, orderIds: string[]) {
  const issues = await db.deliveryIssue.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const issueIds = issues.map(issue => issue.id);
  const cash = await db.cashTransaction.findMany({ where: { orderId: { in: orderIds } }, select: { shiftId: true } });
  const shifts = cash.flatMap(row => row.shiftId ? [row.shiftId] : []);
  await db.cashTransaction.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.courierShift.deleteMany({ where: { id: { in: shifts }, transactions: { none: {} } } });
  await db.paymentIssue.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.orderFinancialAdjustment.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.replacementDelivery.deleteMany({ where: { OR: [{ originalOrderId: { in: orderIds } }, { fulfillmentOrderId: { in: orderIds } }] } });
  await db.deliveryIssueItem.deleteMany({ where: { issueId: { in: issueIds } } });
  await db.deliveryIssue.deleteMany({ where: { id: { in: issueIds } } });
  await db.deliveryAttempt.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.operationalAudit.deleteMany({ where: { entityId: { in: [...orderIds, ...issueIds, ...shifts] } } });
}
