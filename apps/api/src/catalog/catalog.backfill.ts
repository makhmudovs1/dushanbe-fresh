import type { PrismaClient } from "@prisma/client";

export async function backfillProductImages(prisma: Pick<PrismaClient, "$executeRaw">) {
  return prisma.$executeRaw`
    INSERT INTO product_images (id, product_id, url, sort_order, is_primary, created_at, updated_at)
    SELECT md5(p.id || ':' || p.image_url), p.id, p.image_url, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM products p
    WHERE NULLIF(BTRIM(p.image_url), '') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id)
    ON CONFLICT (product_id, url) DO NOTHING
  `;
}
