"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { productDescription } from "@dushanbe-fresh/shared";
import { LOCALE_COOKIE, localizedName, translate, type Locale } from "./locale";
import * as format from "@/lib/format";
import { slotLabel as formatSlot } from "@/lib/checkout";

const Context = createContext<{ locale: Locale; change: (locale: Locale) => void }>({ locale: "ru", change: () => {} });

export function LanguageProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocale] = useState(initialLocale);
  const router = useRouter();
  const pathname = usePathname();
  function change(next: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    document.documentElement.lang = next;
    setLocale(next);
    router.refresh();
  }
  return <Context.Provider value={{ locale: pathname?.startsWith("/admin") ? "ru" : locale, change }}>{children}</Context.Provider>;
}

export function useI18n() {
  const { locale, change } = useContext(Context);
  const t = (value: string) => translate(locale, value);
  return {
    locale, change, t,
    name: (value: { name: string; nameTj?: string | null }) => localizedName(locale, value),
    label: (value: { label: string; labelTj?: string | null }) => locale === "tg" ? value.labelTj || t(value.label) : value.label,
    description: (value: Parameters<typeof productDescription>[0]) => productDescription(value, locale),
    priceLabel: (price: string, unit: string, slug?: string) => format.priceLabel(price, unit, locale, slug),
    quantityLabel: (quantity: string | null, unit: string) => format.quantityLabel(quantity, unit, locale),
    unitLabel: (unit: string, quantity?: string) => format.unitLabel(unit, quantity, locale),
    slotLabel: (slot: Parameters<typeof formatSlot>[0]) => formatSlot(slot, locale)
  };
}

export function LanguageSwitcher() {
  const { locale, change } = useI18n();
  return <div className="language-switcher" role="group" aria-label="Язык / Забон">
    <button type="button" lang="ru" aria-label="Русский" aria-pressed={locale === "ru"} onClick={() => change("ru")}>RU</button>
    <span aria-hidden="true">|</span>
    <button type="button" lang="tg" aria-label="Тоҷикӣ" aria-pressed={locale === "tg"} onClick={() => change("tg")}>TJ</button>
  </div>;
}
