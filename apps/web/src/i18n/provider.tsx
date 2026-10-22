"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { productDescription } from "@dushanbe-fresh/shared";
import { LOCALE_COOKIE, localizedName, translate, type Locale } from "./locale";
import * as format from "@/lib/format";
import { slotLabel as formatSlot } from "@/lib/checkout";
import { Check, Languages } from "lucide-react";
import { CatalogDialog } from "@/components/catalog-dialog";

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
  const [open, setOpen] = useState(false);
  return <div className="language-switcher language-switcher--menu">
    <button type="button" aria-label="Язык / Забон" title="Язык / Забон" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><Languages size={21} aria-hidden="true" /></button>
    {open ? <CatalogDialog title="Язык / Забон" closeLabel={locale === "ru" ? "Закрыть" : "Пӯшидан"} className="language-dialog" busy={false} onClose={() => setOpen(false)}>
      {([{ code: "ru", label: "Русский" }, { code: "tg", label: "Тоҷикӣ" }] as const).map(language => <button className="language-choice" type="button" key={language.code} lang={language.code} aria-pressed={locale === language.code} onClick={() => { change(language.code); setOpen(false); }}><span>{language.label}</span>{locale === language.code ? <Check size={20} aria-hidden="true" /> : null}</button>)}
    </CatalogDialog> : null}
  </div>;
}
