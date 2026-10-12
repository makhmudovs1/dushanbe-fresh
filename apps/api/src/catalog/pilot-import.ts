import { Prisma, PrismaClient } from "@prisma/client";
import { assertCatalogImage, catalogImage } from "./catalog.image";

type Category = { slug: string; nameRu: string; nameTj: string; sortOrder: number };
type Product = {
  slug: string; categorySlug: string; nameRu: string; nameTj: string; unit: string;
  referencePurchasePrice: number | string; minQuantity: number | string; quantityStep: number | string;
  isWeighted: boolean; desiredActive: boolean; isAvailableToday: boolean; sourceOrder: number;
  qualityOptions?: Array<{ label: string; labelTj?: string; sortOrder?: number }>;
};
export type PilotCatalog = { version: number; productCount: number; categories: Category[]; products: Product[] };

function text(value: unknown) { return typeof value === "string" && value.trim().length > 0; }
function decimal(value: unknown, places: number) {
  if ((typeof value !== "number" && typeof value !== "string") || !new RegExp(`^\\d+(\\.\\d{1,${places}})?$`).test(String(value))) throw new Error("Invalid decimal in pilot catalog");
  const result = new Prisma.Decimal(String(value));
  if (!result.isFinite() || result.lte(0) || result.gte("1000000000")) throw new Error("Pilot decimal out of range");
  return result;
}

export function parsePilotCatalog(raw: unknown): PilotCatalog {
  if (!raw || typeof raw !== "object") throw new Error("Invalid pilot catalog");
  const data = raw as PilotCatalog;
  if (!Array.isArray(data.categories) || !Array.isArray(data.products) || data.productCount !== data.products.length || !data.products.length) throw new Error("Invalid product count");
  const categorySlugs = new Set<string>();
  for (const c of data.categories) {
    if (!c || !text(c.slug) || !/^[a-z0-9-]+$/.test(c.slug) || !text(c.nameRu) || !text(c.nameTj) || !Number.isInteger(c.sortOrder) || categorySlugs.has(c.slug)) throw new Error("Invalid or duplicate category");
    categorySlugs.add(c.slug);
  }
  const productSlugs = new Set<string>();
  for (const p of data.products) {
    if (!p || !text(p.slug) || !/^[a-z0-9-]+$/.test(p.slug) || !text(p.nameRu) || !text(p.nameTj) || !categorySlugs.has(p.categorySlug) || productSlugs.has(p.slug)) throw new Error("Invalid or duplicate product");
    if (!["kg", "g", "piece", "bunch", "pack"].includes(p.unit) || !Number.isInteger(p.sourceOrder) || [p.isWeighted, p.desiredActive, p.isAvailableToday].some(v => typeof v !== "boolean")) throw new Error("Invalid product flags/unit");
    decimal(p.referencePurchasePrice, 2); decimal(p.minQuantity, 3); decimal(p.quantityStep, 3);
    if (p.qualityOptions !== undefined && (!Array.isArray(p.qualityOptions) || p.qualityOptions.some(o => !o || !text(o.label) || (o.labelTj !== undefined && !text(o.labelTj)) || (o.sortOrder !== undefined && !Number.isInteger(o.sortOrder))) || new Set(p.qualityOptions.map(o => o.label)).size !== p.qualityOptions.length)) throw new Error("Invalid quality options");
    productSlugs.add(p.slug);
  }
  return data;
}

export function pilotProductData(product: Product, image: string | null) {
  const active = product.desiredActive;
  assertCatalogImage(image);
  const purchase = decimal(product.referencePurchasePrice, 2);
  return {
    name: product.nameRu, nameTj: product.nameTj, unit: product.unit,
    currentPurchasePrice: purchase,
    currentSalePrice: purchase.mul("1.15").toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
    minQuantity: decimal(product.minQuantity, 3), quantityStep: decimal(product.quantityStep, 3),
    isWeighted: product.isWeighted, isActive: active, isAvailableToday: product.isAvailableToday, sortOrder: product.sourceOrder
  };
}

export async function importPilotCatalog(db: PrismaClient, data: PilotCatalog, apply = false) {
  return db.$transaction(async tx => {
    // Serialize imports. Serializable isolation also rejects concurrent catalog edits.
    if (apply) await tx.$executeRaw`SELECT pg_advisory_xact_lock(7412053)`;
    else await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const categories = await tx.category.findMany({ select: { id: true, slug: true, deletedAt: true } });
    const products = await tx.product.findMany({ select: { id: true, slug: true, imageUrl: true, deletedAt: true } });
    for (const c of data.categories) if (categories.find(row => row.slug === c.slug)?.deletedAt) throw new Error(`Category slug is soft-deleted: ${c.slug}`);
    const plan = data.products.map(p => {
      const old = products.find(row => row.slug === p.slug);
      if (old?.deletedAt) throw new Error(`Product slug is soft-deleted: ${p.slug}`);
      const values = pilotProductData(p, old?.imageUrl ?? null);
      return { slug: p.slug, action: old ? "update" : "create", purchase: values.currentPurchasePrice.toFixed(2), sale: values.currentSalePrice.toFixed(2), active: values.isActive, missingPhoto: !catalogImage(old?.imageUrl) };
    });
    if (apply) {
      const categoryIds = new Map<string, string>();
      for (const c of data.categories) {
        const values = { name: c.nameRu, nameTj: c.nameTj, sortOrder: c.sortOrder };
        const category = await tx.category.upsert({ where: { slug: c.slug }, create: { ...values, slug: c.slug }, update: values });
        categoryIds.set(c.slug, category.id);
      }
      for (const p of data.products) {
        const old = products.find(row => row.slug === p.slug);
        const values = { ...pilotProductData(p, old?.imageUrl ?? null), categoryId: categoryIds.get(p.categorySlug)! };
        // imageUrl, descriptions, IDs and historical order snapshots are intentionally untouched.
        const product = await tx.product.upsert({ where: { slug: p.slug }, create: { ...values, slug: p.slug }, update: values });
        if (p.qualityOptions !== undefined) {
          const existing = await tx.productQualityOption.findMany({ where: { productId: product.id } });
          await tx.productQualityOption.updateMany({ where: { productId: product.id }, data: { isActive: false } });
          for (const [index, option] of p.qualityOptions.entries()) {
            const match = existing.find(row => row.label === option.label);
            const optionData = { label: option.label, labelTj: option.labelTj, sortOrder: option.sortOrder ?? index, isActive: true };
            if (match) await tx.productQualityOption.update({ where: { id: match.id }, data: optionData });
            else await tx.productQualityOption.create({ data: { ...optionData, productId: product.id } });
          }
        }
      }
    }
    return { applied: apply, created: plan.filter(p => p.action === "create").length, updated: plan.filter(p => p.action === "update").length, categories: data.categories.length, withoutPhoto: plan.filter(p => p.missingPhoto).map(p => p.slug), products: plan };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
