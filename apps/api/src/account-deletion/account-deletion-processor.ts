import { createHash, randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

type DeletionDecision = { requestId: string; policyVersion: string; approvedFingerprint?: string };

/** Restricted operator workflow. No customer or staff HTTP endpoint can execute a deletion. */
export async function processAccountDeletion(db: PrismaClient, decision: DeletionDecision, env: NodeJS.ProcessEnv = process.env) {
  const { requestId, policyVersion, approvedFingerprint } = decision;
  if (approvedFingerprint && (env.CUSTOMER_ACCOUNT_DELETION_EXECUTION_ENABLED !== "true" || env.CUSTOMER_ACCOUNT_DELETION_POLICY_VERSION !== policyVersion)) {
    throw new Error("Deletion execution is disabled for this policy version.");
  }

  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM customer_account_deletion_requests WHERE id = ${requestId} FOR UPDATE`;
    const request = await tx.customerAccountDeletionRequest.findUnique({ where: { id: requestId } });
    if (request?.policyVersion !== policyVersion) throw new Error("Request and policy version do not match.");
    if (request.status === "completed" && request.completedAt && !request.userId) {
      return { status: "completed" as const, requestId, completedAt: request.completedAt.toISOString() };
    }
    if (request.status !== "requested" || !request.userId) throw new Error("Request is in an unexpected state.");

    const userId = request.userId;
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: { customerProfile: true } });
    if (user.role !== "customer" || user.roles.length || user.status !== "active" || !user.phone || !user.phoneVerifiedAt) {
      throw new Error("Verified customer account required.");
    }

    const profile = user.customerProfile;
    const orders = await tx.order.findMany({
      where: { OR: [{ accountUserId: userId }, { legacyCustomerId: userId }, { address: { userId } }, ...(profile ? [{ customerId: profile.id }] : [])] },
      orderBy: { id: "asc" },
      include: {
        address: { select: { userId: true } }, deliveryWave: { select: { status: true } },
        cashTransactions: { orderBy: { id: "asc" }, include: { shift: { select: { status: true } } } },
        items: { orderBy: { id: "asc" }, select: { id: true } },
        recovery: { select: { fulfillmentOrderId: true } },
        _count: { select: { issues: true, attempts: true, adjustments: true, paymentIssues: true, replacements: true } },
      },
    });
    const orderIds = orders.map(order => order.id);
    const audit = await tx.operationalAudit.findMany({
      where: { entityId: { in: [...orderIds, ...orders.flatMap(order => order.items.map(item => item.id)), ...(profile ? [profile.id] : [])] }, details: { not: Prisma.AnyNull } },
      select: { id: true, action: true, details: true }, orderBy: { id: "asc" },
    });
    const holds = new Set<string>();
    if (profile && (profile.phoneNormalized !== user.phone || profile.riskStatus !== "normal" || profile.codPolicy !== "allowed" || !profile.isActive || profile.adminNote || profile.confirmedCustomerFaultIncidents || profile.unpaidIncidents)) {
      holds.add("customer-record-review");
    }
    for (const order of orders) {
      // Phone matches alone do not establish ownership of guest records.
      if ([order.accountUserId, order.legacyCustomerId, order.address?.userId].some(owner => owner && owner !== userId) || (order.customerId && order.customerId !== profile?.id)) {
        holds.add("order-ownership-review");
      }
      const settled = order.status === "delivered" && order.paymentStatus === "paid";
      const cancelled = order.status === "cancelled" && order.legacyPaidAmount.isZero() && order.cashTransactions.length === 0 && ["pending", "unpaid", "failed"].includes(order.paymentStatus);
      if ((!settled && !cancelled) || (order.deliveryWave && !["delivered", "cancelled"].includes(order.deliveryWave.status)) || order.cashTransactions.some(row => row.type !== "collection" || row.note || row.shift?.status !== "reconciled")) {
        holds.add("unsettled-orders-or-cash");
      }
      if (order.recovery || Object.values(order._count).some(Boolean)) holds.add("order-incident-review");
    }
    for (const record of audit) {
      // Standard collection audit contains totals and an empty note. Other detailed records need individual review.
      if (record.action !== "cash.collection" || !record.details || typeof record.details !== "object" || Array.isArray(record.details) || record.details.note !== "") {
        holds.add("audit-record-review");
      }
    }

    const fingerprint = createHash("sha256").update(JSON.stringify({ requestId, policyVersion, userId, profile: profile?.updatedAt, orders, audit })).digest("hex");
    const plan = { requestId, status: "requested" as const, orderCount: orders.length, holds: [...holds].sort(), fingerprint };
    if (!approvedFingerprint) return plan;
    if (approvedFingerprint !== fingerprint || holds.size) throw new Error("Reviewed scope changed or requires individual review. No deletion applied.");

    for (const id of orderIds) {
      await tx.order.update({ where: { id }, data: {
        accountUserId: null, legacyCustomerId: null, customerId: null, addressId: null,
        deliveryAddressSnapshot: { city: "", street: "", building: "", recipientName: "", phone: "" },
        customerComment: null, qualityComment: null,
        publicTrackingToken: randomBytes(32).toString("hex"), checkoutRequestHash: null,
      } });
    }
    await tx.orderItem.updateMany({ where: { orderId: { in: orderIds }, pickerNote: { not: null } }, data: { pickerNote: null } });
    await tx.customerOtpChallenge.deleteMany({ where: { phone: user.phone } });
    if (profile) await tx.customer.delete({ where: { id: profile.id } });
    // The existing foreign keys cascade sessions, addresses, cart and favorites, and detach the receipt.
    await tx.user.delete({ where: { id: userId } });
    const completedAt = new Date();
    await tx.customerAccountDeletionRequest.update({ where: { id: requestId }, data: { status: "completed", completedAt } });
    return { status: "completed" as const, requestId, completedAt: completedAt.toISOString() };
  }, { isolationLevel: "Serializable", timeout: 20000 });
}
