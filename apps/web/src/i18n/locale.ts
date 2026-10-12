import { tajik } from "./messages";
import { catalogNames } from "./catalog-names";

export type Locale = "ru" | "tg";
export const LOCALE_COOKIE = "df-language";
export function parseLocale(value?: string): Locale { return value === "tg" ? "tg" : "ru"; }

export function translate(locale: Locale, value: string): string {
  if (locale === "ru") return value;
  const key = value.trim().replace(/\s+/g, " ");
  const translated = tajik[key] ?? catalogNames[key];
  if (translated) return value.replace(value.trim(), translated);
  let match: RegExpMatchArray | null;
  if ((match = key.match(/^До минимального заказа не хватает (.+) сомони\.$/))) return `То фармоиши ҳадди ақал ${match[1]} сомонӣ намерасад.`;
  if ((match = key.match(/^Проверьте количество: минимум (.+), шаг (.+)\.$/))) return `Миқдорро санҷед: ҳадди ақал ${match[1]}, қадам ${match[2]}.`;
  if ((match = key.match(/^(.+) сегодня больше недоступны\.$/))) return `${translate(locale, match[1])} имрӯз дигар дастрас нест.`;
  if ((match = key.match(/^Цена «(.+)» изменилась с (.+) до (.+) сомони за единицу\.$/))) return `Нархи «${translate(locale, match[1])}» аз ${match[2]} ба ${match[3]} сомонӣ барои воҳид тағйир ёфт.`;
  if ((match = key.match(/^Проверьте поле «(.+)»\.$/))) return `Майдони «${translate(locale, match[1])}»-ро санҷед.`;
  if ((match = key.match(/^Корзина, позиций: (\d+)$/))) return `Сабад, мавқеъҳо: ${match[1]}`;
  if ((match = key.match(/^(Количество|Уменьшить количество|Увеличить количество|Предпочтение качества|Удалить): (.+)$/))) return `${translate(locale, match[1] + (tajik[match[1]] ? "" : ":")).replace(/:$/, "")}: ${translate(locale, match[2])}`;
  if ((match = key.match(/^(.+): фото пока нет$/))) return `${match[1]}: ҳоло акс нест`;
  if (/^, (кв\.|подъезд|этаж) /.test(value)) return value.replace(/кв\./, "ҳуҷ.").replace(/подъезд/, "даромадгоҳ").replace(/этаж/, "ошёна");
  if (key.endsWith(" сомони")) return value.replace(/сомони/g, "сомонӣ");
  return value;
}

export function localizedName(locale: Locale, value: { name: string; nameTj?: string | null }) {
  return locale === "tg" ? value.nameTj || translate(locale, value.name) : value.name;
}
