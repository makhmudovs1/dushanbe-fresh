import type { PriceMode, PricingSettings } from "@dushanbe-fresh/shared";
import type { Category, Product } from "./api";

export const markupPattern = "[0-9]{1,5}([.,][0-9]{1,2})?";
export function validMarkup(value: string) {
  return /^\d{1,5}(\.\d{1,2})?$/.test(value) && Number(value) <= 10000;
}

export function resolveMarkup(individual: string, categoryId: string, categories: Category[], settings: PricingSettings | null) {
  if (individual !== "") return { percent: individual, source: "Индивидуальная" };
  const category = categories.find(item => item.id === categoryId);
  if (category?.markupPercent != null) return { percent: category.markupPercent, source: "Категория" };
  return { percent: settings?.defaultMarkupPercent ?? "", source: "Общая" };
}

// Integer cents and hundredths of a percent match server Decimal half-up rounding.
export function calculateAutoPrice(purchase: string, markup: string): string | null {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(purchase) || !validMarkup(markup)) return null;
  const scaled = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  };
  const cost = scaled(purchase);
  if (cost === BigInt(0)) return null;
  const cents = (cost * (BigInt(10000) + scaled(markup)) + BigInt(5000)) / BigInt(10000);
  if (cents > BigInt("999999999999")) return null;
  return `${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
}

export type PricingForm = {
  priceMode: PriceMode;
  purchasePrice: string;
  sellingPrice: string;
  markupPercent: string;
  appliedMarkupPercent: string;
  categoryId: string;
};

export function changeProductPricing<T extends PricingForm>(form: T, patch: Partial<PricingForm>, categories: Category[], settings: PricingSettings | null): T {
  const next = { ...form, ...patch };
  if (next.priceMode === "manual") return next;
  const changedPolicy = patch.categoryId !== undefined || patch.markupPercent !== undefined || patch.priceMode === "auto";
  const percent = changedPolicy || !next.appliedMarkupPercent
    ? resolveMarkup(next.markupPercent, next.categoryId, categories, settings).percent
    : next.appliedMarkupPercent;
  const price = calculateAutoPrice(next.purchasePrice, percent);
  return { ...next, appliedMarkupPercent: percent, sellingPrice: price ?? next.sellingPrice };
}

export function productPricingPayload<T extends PricingForm>(form: T, existing?: Product, resetAuto = false): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...form, markupPercent: form.markupPercent || null, purchasePrice: form.purchasePrice || "0.00" };
  delete payload.appliedMarkupPercent;
  delete payload.individualMarkup;
  if (form.priceMode === "auto") delete payload.sellingPrice;
  if (existing) {
    if (form.categoryId === existing.category.id) delete payload.categoryId;
    if (form.priceMode === (existing.priceMode ?? "manual") && !resetAuto) delete payload.priceMode;
    if (form.markupPercent === (existing.markupPercent ?? "")) delete payload.markupPercent;
    if (form.purchasePrice === (existing.purchasePrice ?? "")) delete payload.purchasePrice;
  }
  return payload;
}
