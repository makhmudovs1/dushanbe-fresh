import { Prisma, PrismaClient } from "@prisma/client";
import { missingProductDescriptions } from "@dushanbe-fresh/shared";

export async function fillCatalogDescriptions(db: PrismaClient, apply = false) {
  return db.$transaction(async tx => {
    if (!apply) await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const products = await tx.product.findMany({
      where: { deletedAt: null },
      select: { id: true, slug: true, description: true, descriptionTj: true },
      orderBy: { slug: "asc" }
    });
    const changes = products.map(product => ({ id: product.id, slug: product.slug, data: missingProductDescriptions(product) }))
      .filter(item => Object.keys(item.data).length > 0);
    if (apply) for (const { id, data } of changes) await tx.product.update({ where: { id }, data });
    return { applied: apply, scanned: products.length, updated: changes.length, changes };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
