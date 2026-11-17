export type Category = {
  id: string;
  name: string;
  nameTj?: string | null;
  slug: string;
  sortOrder: number;
  isVisible?: boolean;
  isActive?: boolean;
  parentId?: string | null;
  imageUrl?: string | null;
  iconUrl?: string | null;
};
// Public DTO only; intentionally independent of Prisma and the staff API.
export type Product = {
  id: string;
  slug: string;
  name: string;
  nameTj?: string | null;
  description: string | null;
  descriptionTj?: string | null;
  image: string | null;
  images: { id: string; url: string; sortOrder: number; isPrimary: boolean }[];
  priceDrop: { oldPrice: string; discountPercent: number } | null;
  unit: string;
  sellingPrice: string;
  isWeighted: boolean;
  isActive?: boolean;
  isAvailableToday?: boolean;
  minQuantity: string;
  quantityStep: string;
  category: Pick<Category, "id" | "name" | "nameTj" | "slug">;
};
export function isProduct(value: unknown): value is Product {
  if (!value || typeof value !== "object") return false;
  const p = value as Product;
  return (
    [p.id, p.slug, p.name, p.unit].every(
      (v) => typeof v === "string" && v.length > 0,
    ) &&
    typeof p.sellingPrice === "string" &&
    /^\d{1,10}(\.\d{1,2})?$/.test(p.sellingPrice) &&
    [p.minQuantity, p.quantityStep].every(
      (v) =>
        typeof v === "string" &&
        /^\d{1,6}(\.\d{1,3})?$/.test(v) &&
        Number(v) > 0,
    ) &&
    typeof p.isWeighted === "boolean" &&
    !!p.category &&
    typeof p.category.id === "string" &&
    Array.isArray(p.images) &&
    p.images.every((i) => typeof i.url === "string")
  );
}
export function parseProducts(value: unknown): Product[] {
  if (!Array.isArray(value) || !value.every(isProduct))
    throw new Error("INVALID_RESPONSE");
  return value;
}
export function parseCategories(value: unknown): Category[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (c) =>
        c &&
        [c.id, c.slug, c.name].every((v) => typeof v === "string") &&
        Number.isFinite(c.sortOrder),
    )
  )
    throw new Error("INVALID_RESPONSE");
  return value;
}
