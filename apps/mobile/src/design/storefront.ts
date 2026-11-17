import {
  categoryDescendantIds,
  visibleCategoryTree,
} from "@dushanbe-fresh/shared";
import type { Category, Product } from "../domain/catalog";
// WEB lib/storefront.ts display rules, independent of React/DOM/pricing.
export function hasPriceDrop(
  product: Pick<Product, "priceDrop" | "sellingPrice">,
) {
  return Boolean(
    product.priceDrop &&
      product.priceDrop.discountPercent > 0 &&
      Number(product.priceDrop.oldPrice) > Number(product.sellingPrice),
  );
}
export function categorySections(
  categories: Category[],
  products: Pick<Product, "category">[],
) {
  const visible = visibleCategoryTree(categories);
  const populated = (category: Category) =>
    products.some((p) =>
      categoryDescendantIds(visible, category.id).includes(p.category.id),
    );
  const roots = visible.filter((c) => !c.parentId && populated(c));
  const vegetables = roots.find((c) => c.slug === "vegetables");
  const greens = roots.find((c) => c.slug === "greens");
  return roots
    .filter((c) => !(vegetables && greens) || c.id !== greens.id)
    .map((category) => {
      const members =
        vegetables && greens && category.id === vegetables.id
          ? [vegetables, greens]
          : [category];
      const tiles = members.flatMap((member) => {
        const children = visible.filter(
          (c) => c.parentId === member.id && populated(c),
        );
        return products.some((p) => p.category.id === member.id) ||
          !children.length
          ? [member, ...children]
          : children;
      });
      return {
        category,
        tiles,
        titleKey: category.slug === "vegetables" ? "Овощные продукты" : null,
        sortOrder: Math.min(...members.map((c) => c.sortOrder)),
      };
    })
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.category.name.localeCompare(b.category.name, "ru"),
    );
}
export function populatedCategory(
  categories: Category[],
  products: Pick<Product, "category">[],
  slugs: string[],
) {
  const visible = visibleCategoryTree(categories);
  return slugs
    .map((slug) => visible.find((c) => c.slug === slug))
    .find(
      (c) =>
        c &&
        products.some((p) =>
          categoryDescendantIds(visible, c.id).includes(p.category.id),
        ),
    );
}
export function productPhotos(product: Pick<Product, "image" | "images">) {
  const photos = [...product.images]
    .filter((p) => p.url)
    .sort(
      (a, b) =>
        Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder,
    )
    .map((p) => p.url);
  return photos.length ? photos : product.image ? [product.image] : [];
}
