// Presentation copied from WEB lib/format.ts. API decimals stay strings.
import type { Locale } from "../i18n";
export function decimalLabel(value: string) {
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${whole},${trimmed}` : whole!;
}
export function quantityUnit(unit: string, locale: Locale, quantity?: string) {
  if (locale === "tg")
    return (
      (
        {
          kg: "кг",
          g: "г",
          bunch: "баста",
          piece: "дона",
          pack: "баста",
        } as Record<string, string>
      )[unit] ?? "воҳид"
    );
  if (unit !== "bunch" || quantity === undefined)
    return (
      (
        {
          kg: "кг",
          g: "г",
          bunch: "пучок",
          piece: "шт.",
          pack: "уп.",
        } as Record<string, string>
      )[unit] ?? "ед."
    );
  const [whole, fraction = ""] = quantity.replace("-", "").split(".");
  if (/[1-9]/.test(fraction)) return "пучка";
  const ending = Number(whole!.slice(-2));
  if (ending >= 11 && ending <= 14) return "пучков";
  if (ending % 10 === 1) return "пучок";
  if (ending % 10 >= 2 && ending % 10 <= 4) return "пучка";
  return "пучков";
}
export function priceUnitLabel(unit: string, locale: Locale, slug?: string) {
  const note =
    unit === "bunch" && (slug === "basil" || slug === "mint")
      ? locale === "tg"
        ? " (~7 шохча)"
        : " (~7 веточек)"
      : "";
  return `1 ${quantityUnit(unit, locale, "1")}${note}`;
}
export const currency = (locale: Locale) =>
  locale === "tg" ? "сомонӣ" : "сомони";
