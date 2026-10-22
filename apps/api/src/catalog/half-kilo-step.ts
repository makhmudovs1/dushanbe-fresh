import { Prisma, PrismaClient } from "@prisma/client";

const where = { unit: "kg", isWeighted: true, quantityStep: { not: new Prisma.Decimal("0.5") } };
const select = { id: true, name: true, quantityStep: true, minQuantity: true } as const;

export async function setHalfKiloStep(db: PrismaClient, apply: boolean) {
  const plan = await db.product.findMany({ where, select, orderBy: { id: "asc" } });
  if (!apply) return { applied: false, changed: 0, plan };
  return db.$transaction(async tx => {
    for (const product of plan) {
      const changed = await tx.product.updateMany({
        where: { id: product.id, unit: "kg", isWeighted: true, quantityStep: product.quantityStep },
        data: { quantityStep: new Prisma.Decimal("0.5") }
      });
      if (changed.count !== 1) throw new Error("Quantity rules changed concurrently; no updates applied. Review the plan again.");
    }
    return { applied: true, changed: plan.length, plan };
  });
}
