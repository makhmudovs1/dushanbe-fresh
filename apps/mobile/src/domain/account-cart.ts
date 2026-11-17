import type {
  MobileCartLine as Line,
  MobileCartSnapshot as Snapshot,
} from "@dushanbe-fresh/shared";
import type { Product } from "./catalog";
import type { CartAction, CartLine } from "./cart";
import { changeQuantity, fixed, validQuantity } from "./decimal";
export const lineKey = (line: Line) =>
  JSON.stringify([line.productId, line.qualityOptionId]);
export const legacyLine = (line: Line) =>
  !!(
    line.qualityOptionId ||
    line.qualityOptionLabel ||
    line.qualityOptionLabelTj
  );
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  ) ===
  JSON.stringify(b, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  );
export function mergeMax(saved: Line[], incoming: Line[]) {
  const result = new Map(saved.map((i) => [lineKey(i), i]));
  for (const item of incoming) {
    const old = result.get(lineKey(item));
    if (old && legacyLine(old)) continue;
    result.set(
      lineKey(item),
      !old || legacyLine(item)
        ? item
        : {
            ...old,
            quantity:
              fixed(old.quantity, 3) >= fixed(item.quantity, 3)
                ? old.quantity
                : item.quantity,
          },
    );
  }
  return [...result.values()];
}
export function reconcile(base: Line[], local: Line[], remote: Line[]) {
  const before = new Map(base.map((i) => [lineKey(i), i])),
    ours = new Map(local.map((i) => [lineKey(i), i])),
    result = new Map(remote.map((i) => [lineKey(i), i]));
  for (const [key, old] of before) {
    const item = ours.get(key);
    if (!item) result.delete(key);
    else if (!equal(old, item)) {
      const theirs = result.get(key);
      if (theirs && legacyLine(theirs)) continue;
      result.set(
        key,
        !theirs || equal(old, theirs) ? item : mergeMax([theirs], [item])[0]!,
      );
    }
  }
  for (const [key, item] of ours)
    if (!before.has(key)) {
      const theirs = result.get(key);
      result.set(key, theirs ? mergeMax([theirs], [item])[0]! : item);
    }
  return [...result.values()];
}
export function legacyConflicts(remote: Line[], incoming: Line[]) {
  const saved = new Map(remote.map((i) => [lineKey(i), i]));
  return incoming.flatMap((item) => {
    const old = saved.get(lineKey(item));
    return old && (legacyLine(old) || legacyLine(item)) && !equal(old, item)
      ? [{ key: lineKey(item), saved: old, incoming: item }]
      : [];
  });
}
export function nativeLine(line: Line): CartLine {
  return {
    product: {
      id: line.productId,
      slug: line.slug,
      name: line.name,
      nameTj: line.nameTj,
      image: line.imageUrl,
      images: [],
      description: null,
      priceDrop: null,
      unit: line.unit,
      sellingPrice: line.sellingPrice,
      isWeighted: line.isWeighted,
      minQuantity: line.minQuantity,
      quantityStep: line.quantityStep,
      category: { id: "", name: "", slug: "" },
    },
    quantity: line.quantity,
    serverSnapshot: line,
  };
}
export function serverLine(item: CartLine): Line {
  if (item.serverSnapshot && legacyLine(item.serverSnapshot))
    return item.serverSnapshot;
  const p = item.product;
  return {
    productId: p.id,
    slug: p.slug,
    name: p.name,
    nameTj: p.nameTj,
    imageUrl: p.image,
    unit: p.unit,
    sellingPrice: p.sellingPrice,
    isWeighted: p.isWeighted,
    minQuantity: p.minQuantity,
    quantityStep: p.quantityStep,
    quantity: item.quantity,
    qualityOptionId: null,
    qualityOptionLabel: null,
  };
}
export function changeLines(items: Line[], action: CartAction): Line[] {
  if (action.type === "clear") return [];
  if (action.type === "remove")
    return items.filter(
      (i) =>
        lineKey(i) !== action.id &&
        !(i.productId === action.id && !legacyLine(i)),
    );
  const p: Product = action.product;
  const previous = items.find((i) => i.productId === p.id);
  if (items.some((i) => i.productId === p.id && legacyLine(i)))
    throw new Error("LEGACY_CART");
  if (!previous && items.length >= 100) throw new Error("CART_LIMIT");
  const quantity =
    action.type === "set"
      ? validQuantity(action.quantity, p.minQuantity, p.quantityStep)
        ? action.quantity
        : (() => {
            throw new Error("QUANTITY_CHANGED");
          })()
      : changeQuantity(
          previous?.quantity,
          p.minQuantity,
          p.quantityStep,
          action.direction,
        );
  if (quantity === "0") return items.filter((i) => i.productId !== p.id);
  const next = serverLine({ product: p, quantity });
  return previous
    ? items.map((i) => (i.productId === p.id ? next : i))
    : [...items, next];
}
export function isCartSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== "object") return false;
  const data = value as Snapshot;
  return (
    Number.isInteger(data.revision) &&
    data.revision >= 0 &&
    Array.isArray(data.items) &&
    data.items.length <= 100 &&
    data.items.every(
      (i) =>
        i &&
        typeof i.productId === "string" &&
        typeof i.name === "string" &&
        typeof i.quantity === "string" &&
        /^\d{1,6}(\.\d{1,3})?$/.test(i.quantity) &&
        typeof i.sellingPrice === "string" &&
        /^\d{1,10}(\.\d{1,2})?$/.test(i.sellingPrice),
    )
  );
}
