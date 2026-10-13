const units: Record<string, string> = { kg: "кг", g: "г", piece: "шт.", pack: "уп.", bunch: "пучок" };

// Presentation only: keep API decimals as strings, without floating-point conversion.
export function decimalLabel(value: string | null) {
  if (value === null) return "—";
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${whole},${trimmed}` : whole;
}

export function unitLabel(unit: string, quantity?: string, locale: "ru" | "tg" = "ru") {
  if (locale === "tg") return ({ kg: "кг", g: "г", bunch: "баста", piece: "дона", pack: "баста" } as Record<string, string>)[unit] ?? "воҳид";
  if (unit !== "bunch" || quantity === undefined) return units[unit] ?? "ед.";
  const [whole, fraction = ""] = quantity.replace("-", "").split(".");
  if (/[1-9]/.test(fraction)) return "пучка";
  const ending = Number(whole.slice(-2));
  if (ending >= 11 && ending <= 14) return "пучков";
  if (ending % 10 === 1) return "пучок";
  if (ending % 10 >= 2 && ending % 10 <= 4) return "пучка";
  return "пучков";
}

export function quantityLabel(quantity: string | null, unit: string, locale: "ru" | "tg" = "ru") {
  return quantity === null ? "—" : `${decimalLabel(quantity)} ${unitLabel(unit, quantity, locale)}`;
}

function productUnitNote(unit: string, locale: "ru" | "tg", slug?: string) {
  return unit === "bunch" && (slug === "basil" || slug === "mint")
    ? locale === "tg" ? " (~7 шохча)" : " (~7 веточек)"
    : "";
}

export function priceUnitLabel(unit: string, locale: "ru" | "tg" = "ru", slug?: string) {
  return `${quantityLabel("1", unit, locale)}${productUnitNote(unit, locale, slug)}`;
}

export function priceLabel(price: string, unit: string, locale: "ru" | "tg" = "ru", slug?: string) {
  return `${decimalLabel(price)} ${locale === "tg" ? "сомонӣ" : "сомони"} / ${unitLabel(unit, undefined, locale)}${productUnitNote(unit, locale, slug)}`;
}
