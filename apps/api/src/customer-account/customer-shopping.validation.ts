import { BadRequestException, UnprocessableEntityException } from "@nestjs/common";
import { isDeepStrictEqual } from "node:util";

export type CartLine = {
  productId: string;
  slug: string;
  name: string;
  nameTj?: string | null;
  imageUrl: string | null;
  unit: string;
  sellingPrice: string;
  isWeighted: boolean;
  quantity: string;
  minQuantity: string;
  quantityStep: string;
  qualityOptionId: string | null;
  qualityOptionLabel: string | null;
  qualityOptionLabelTj?: string | null;
  status?: "unavailable";
};
export type CartSnapshot = { revision: number; items: CartLine[] };

const invalid = () => new BadRequestException("Проверьте данные корзины или избранного.");
const lineFields = ["productId", "slug", "name", "nameTj", "imageUrl", "unit", "sellingPrice", "isWeighted", "quantity", "minQuantity", "quantityStep", "qualityOptionId", "qualityOptionLabel", "qualityOptionLabelTj", "status"];
const hasControlCharacters = (value: string) => Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);

export function shoppingRecord(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !fields.includes(key))) throw invalid();
  return body;
}

export function shoppingId(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 100 || /\s/.test(value) || hasControlCharacters(value)) throw invalid();
  return value;
}

function text(value: unknown, max: number, nullable = false, empty = false) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || value.length > max || (!empty && !value.trim()) || hasControlCharacters(value)) throw invalid();
}

function decimal(value: unknown, price = false) {
  if (typeof value !== "string" || !(price ? /^\d{1,10}(\.\d{1,2})?$/ : /^\d{1,6}(\.\d{1,3})?$/).test(value) || (!price && Number(value) <= 0)) throw invalid();
}

export function assertCartBound(items: CartLine[]) {
  if (items.length > 100) throw new BadRequestException("В корзине может быть не больше 100 позиций.");
  if (Buffer.byteLength(JSON.stringify(items), "utf8") > 240000) throw new BadRequestException("Корзина слишком большая. Удалите часть товаров и попробуйте снова.");
}

export function parseCartItems(value: unknown): CartLine[] {
  if (!Array.isArray(value)) throw invalid();
  // Bound all input, including unexpected properties, before retaining any snapshot.
  assertCartBound(value);
  const keys = new Set<string>();
  return value.map(value => {
    const item = shoppingRecord(value, lineFields);
    shoppingId(item.productId);
    if (item.qualityOptionId !== null) shoppingId(item.qualityOptionId);
    text(item.slug, 200, false, true);
    if (!/^[\p{L}\p{N}_-]*$/u.test(item.slug as string)) throw invalid();
    text(item.name, 500);
    text(item.unit, 30);
    text(item.imageUrl, 2048, true);
    const image = item.imageUrl as string | null;
    if (image && (!/^(\/(?!\/)|https:\/\/)/.test(image) || /[\s\\]/.test(image))) throw invalid();
    text(item.qualityOptionLabel, 500, true, true);
    for (const field of ["nameTj", "qualityOptionLabelTj"]) {
      if (item[field] !== undefined) text(item[field], 500, true, true);
    }
    if (typeof item.isWeighted !== "boolean" || (item.status !== undefined && item.status !== "unavailable")) throw invalid();
    decimal(item.sellingPrice, true);
    for (const field of ["quantity", "minQuantity", "quantityStep"]) decimal(item[field]);
    const line = { ...item } as CartLine;
    delete line.status;
    const key = cartKey(line);
    if (keys.has(key)) throw invalid();
    keys.add(key);
    return line;
  });
}

export function parseCartWrite(value: unknown) {
  const body = shoppingRecord(value, ["revision", "items"]);
  if (!Number.isInteger(body.revision) || (body.revision as number) < 0 || (body.revision as number) >= 2147483647) throw invalid();
  return { revision: body.revision as number, items: parseCartItems(body.items) };
}

export function parseCartImport(value: unknown) {
  const body = shoppingRecord(value, ["sourceId", "items"]);
  if (typeof body.sourceId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.sourceId)) throw invalid();
  return { sourceId: body.sourceId.toLowerCase(), items: parseCartItems(body.items) };
}

export function cartKey(item: Pick<CartLine, "productId" | "qualityOptionId">) {
  return JSON.stringify([item.productId, item.qualityOptionId]);
}

export function isLegacyLine(item: CartLine) {
  return !!(item.qualityOptionId || item.qualityOptionLabel || item.qualityOptionLabelTj);
}

export function assertLegacyCartCompatible(currentCart: CartSnapshot, incoming: CartLine[]) {
  const saved = new Map(currentCart.items.map(item => [cartKey(item), item]));
  const conflicts: Array<{ saved: CartLine; incoming: CartLine }> = [];
  for (const item of incoming) {
    const previous = saved.get(cartKey(item));
    if (previous && (isLegacyLine(previous) || isLegacyLine(item)) && !isDeepStrictEqual(previous, item)) {
      conflicts.push({ saved: previous, incoming: item });
    }
  }
  if (conflicts.length) throw new UnprocessableEntityException({
    code: "CART_LEGACY_REVIEW_REQUIRED", retryable: false,
    message: "В корзинах есть несовместимые старые позиции. Сравните варианты и количество, удалите ненужные и повторите сохранение.",
    currentCart, conflicts
  });
}

export function mergeCartItems(currentCart: CartSnapshot, incoming: CartLine[]): CartLine[] {
  assertLegacyCartCompatible(currentCart, incoming);
  const merged = new Map(currentCart.items.map(item => [cartKey(item), item]));
  for (const item of incoming) {
    const key = cartKey(item);
    const previous = merged.get(key);
    if (previous && isLegacyLine(previous)) continue;
    if (isLegacyLine(item)) { merged.set(key, item); continue; }
    merged.set(key, previous ? { ...previous, quantity: Number(previous.quantity) >= Number(item.quantity) ? previous.quantity : item.quantity } : item);
  }
  const items = [...merged.values()];
  assertCartBound(items);
  return items;
}
