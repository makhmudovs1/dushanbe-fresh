import type { PublicOrderLine } from "@dushanbe-fresh/shared";
import type { Product } from "./api";

export function orderDate(value: string, locale: "ru" | "tg", includeTime = true) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "tg" ? "tg-TJ" : "ru-RU", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dushanbe",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } as const : {})
  }).format(date);
}

// Tracking exposes snapshots, not product IDs. Never guess a variety from a partial name.
export function orderPhoto(item: PublicOrderLine, products: Product[]) {
  const matches = products.filter(product => product.name === item.name);
  return matches.length === 1 ? matches[0].image : null;
}

export function minimumProgress(minimum: string, shortfall: string) {
  const target = Number(minimum), remaining = Number(shortfall);
  if (!Number.isFinite(target) || !Number.isFinite(remaining) || target < 0 || remaining < 0) return null;
  return target === 0 ? 100 : Math.max(0, Math.min(100, (target - remaining) / target * 100));
}
