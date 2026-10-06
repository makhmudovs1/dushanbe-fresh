import type { StaffUser } from "@dushanbe-fresh/shared";
import type { Prisma } from "@prisma/client";

export function audit(tx: Prisma.TransactionClient, actor: StaffUser | undefined, action: string, entityId: string) {
  if (actor) return tx.operationalAudit.create({ data: { userId: actor.id, action, entityId } });
}
