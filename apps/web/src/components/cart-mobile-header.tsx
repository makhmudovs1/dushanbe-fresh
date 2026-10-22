"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, Share2, Trash2 } from "lucide-react";
import { useCart } from "@/cart/cart-context";
import { calculateCartSubtotalMinor, calculateItemSubtotalMinor, formatMoneyFromMinor, hasWeightedItems, type CartState } from "@/cart/cart";
import { useI18n } from "@/i18n/provider";
import { decimalLabel } from "@/lib/format";
import { CatalogDialog } from "./catalog-dialog";
import styles from "./cart-enhancements.module.css";

export function cartShareText(state: CartState, { t, name, label, quantityLabel }: Pick<ReturnType<typeof useI18n>, "t" | "name" | "label" | "quantityLabel">) {
  const lines = state.items.map(item => {
    const quality = item.qualityOptionLabel
      ? ` (${label({ label: item.qualityOptionLabel, labelTj: item.qualityOptionLabelTj })})` : "";
    const amount = decimalLabel(formatMoneyFromMinor(calculateItemSubtotalMinor(item)));
    return `${name(item)}${quality}: ${quantityLabel(item.quantity, item.unit)} - ${item.isWeighted ? "≈ " : ""}${amount} ${t("сомони")}`;
  });
  const subtotal = decimalLabel(formatMoneyFromMinor(calculateCartSubtotalMinor(state)));
  return [`Dushanbe Fresh - ${t("Корзина")}`, ...lines,
    `${t("Предварительно")}: ${hasWeightedItems(state) ? "≈ " : ""}${subtotal} ${t("сомони")}`,
    `${t("Доставка")}: ${t("будет рассчитана позже")}`].join("\n");
}

export async function shareCartText(text: string, title: string, browser: Pick<Navigator, "share" | "clipboard">) {
  if (typeof browser.share === "function") {
    try {
      await browser.share({ title, text });
      return "shared";
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && error.name === "AbortError") return "cancelled";
    }
  }
  await browser.clipboard.writeText(text);
  return "copied";
}

export function CartMobileHeader() {
  const i18n = useI18n();
  const { t } = i18n;
  const { state, hydrated, clearCart } = useCart();
  const [confirmClear, setConfirmClear] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [notice, setNotice] = useState("");
  const cancelButton = useRef<HTMLButtonElement>(null);
  const disabled = !hydrated || !state.items.length;

  useEffect(() => {
    if (!confirmClear) return;
    // Wait for CatalogDialog's modal setup, including Strict Mode effect replay.
    const frame = requestAnimationFrame(() => cancelButton.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [confirmClear]);

  async function share() {
    setSharing(true);
    setNotice("");
    try {
      const result = await shareCartText(cartShareText(state, i18n), t("Корзина"), navigator);
      if (result === "copied") setNotice("Состав корзины скопирован");
    } catch {
      setNotice("Не удалось поделиться корзиной. Попробуйте ещё раз.");
    } finally {
      setSharing(false);
    }
  }

  return <>
    <header className={styles.mobileHeader}>
      <div className={styles.headerRow}>
        <h1>{t("Корзина")}</h1>
        <div className={styles.actions}>
          <button className="catalog-icon-action" type="button" disabled={disabled || sharing}
            aria-label={t("Поделиться корзиной")} title={t("Поделиться корзиной")} onClick={share}>
            <Share2 size={21} aria-hidden="true" />
          </button>
          <Link className="catalog-icon-action" href="/catalog?focusSearch=1"
            aria-label={t("Поиск товаров")} title={t("Поиск товаров")}>
            <Search size={22} aria-hidden="true" />
          </Link>
          <button className="catalog-icon-action" type="button" disabled={disabled}
            aria-label={t("Очистить корзину")} title={t("Очистить корзину")} onClick={event => {
              event.currentTarget.focus({ preventScroll: true });
              setConfirmClear(true);
            }}>
            <Trash2 size={21} aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className={styles.notice} role="status" aria-live="polite">{t(notice)}</p>
    </header>
    {confirmClear ? <CatalogDialog title={t("Очистить корзину?")} busy={false}
      className={styles.clearDialog} closeLabel={t("Отмена")} onClose={() => setConfirmClear(false)}>
      <p>{t("Все товары будут удалены из корзины.")}</p>
      <div className={styles.confirmActions}>
        <button ref={cancelButton} type="button" className="secondary-link" onClick={() => setConfirmClear(false)}>{t("Отмена")}</button>
        <button type="button" className="primary-action" onClick={() => {
          clearCart(); setConfirmClear(false); setNotice("");
        }}><Trash2 size={18} aria-hidden="true" />{t("Удалить все товары")}</button>
      </div>
    </CatalogDialog> : null}
  </>;
}
