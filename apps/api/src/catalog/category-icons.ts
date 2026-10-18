import { Prisma, type PrismaClient } from "@prisma/client";

export const categoryIconSlugs = ["vegetables", "fruits", "greens", "nuts-dried-fruits", "legumes"] as const;
type IconCategory = { id: string; slug: string; iconUrl: string | null };

export function categoryIconPlan(categories: IconCategory[]) {
  return categories.filter(category => categoryIconSlugs.some(slug => slug === category.slug) && !category.iconUrl)
    .map(category => ({ ...category, nextIcon: `/storefront/icons/${category.slug}.webp` }));
}

export async function applyCategoryIcons(db: PrismaClient, apply = false) {
  return db.$transaction(async tx => {
    const categories = await tx.category.findMany({ where: { slug: { in: [...categoryIconSlugs] }, deletedAt: null },
      select: { id: true, slug: true, iconUrl: true }, orderBy: { sortOrder: "asc" } });
    const plan = categoryIconPlan(categories);
    if (apply) for (const category of plan) {
      const result = await tx.category.updateMany({ where: { id: category.id, deletedAt: null, iconUrl: category.iconUrl }, data: { iconUrl: category.nextIcon } });
      if (result.count !== 1) throw new Error(`Category changed during icon update: ${category.slug}`);
    }
    return { dryRun: !apply, updated: apply ? plan.length : 0, plan: plan.map(category => ({ slug: category.slug, image: category.nextIcon })) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
