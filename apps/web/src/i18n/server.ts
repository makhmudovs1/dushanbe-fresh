import { cookies } from "next/headers";
import { LOCALE_COOKIE, localizedName, parseLocale, translate } from "./locale";

export function serverI18n() {
  const locale = parseLocale(cookies().get(LOCALE_COOKIE)?.value);
  return { locale, t: (value: string) => translate(locale, value), name: (value: { name: string; nameTj?: string | null }) => localizedName(locale, value) };
}
