"use client";
import { useI18n } from "@/i18n/provider";


import { Minus, Plus } from "lucide-react";
import { decimalLabel } from "@/lib/format";

export function QuantityStepper({ name, quantity, unit, onDecrease, onIncrease, onAdd, decreaseDisabled = false, disabled = false }: {
  name: string; quantity: string; unit: string;
  onDecrease: () => void; onIncrease: () => void;
  decreaseDisabled?: boolean; disabled?: boolean;
  onAdd?: () => void;
}) {
  const { t, quantityLabel, unitLabel } = useI18n();
  return <div className={`quantity-stepper${onAdd ? " quantity-stepper--empty" : ""}`} role="group" aria-label={t(`Количество: ${name}`)}>
    <button type="button" aria-label={t(`Уменьшить количество: ${name}`)} title={t("Уменьшить количество")}
      aria-hidden={onAdd ? true : undefined} disabled={disabled || decreaseDisabled || !!onAdd} onClick={onDecrease}><Minus size={18} aria-hidden="true" /></button>
    <output aria-hidden={onAdd ? true : undefined} aria-live="polite" aria-atomic="true" aria-label={quantityLabel(quantity, unit)} title={quantityLabel(quantity, unit)}>
      <span>{decimalLabel(quantity)}</span>{" "}<span>{unitLabel(unit, quantity)}</span>
    </output>
    <button type="button" className={onAdd ? "product-card__action" : undefined}
      aria-label={onAdd ? `${t("Добавить в корзину")}: ${name}` : t(`Увеличить количество: ${name}`)}
      title={onAdd ? `${t("Добавить в корзину")}: ${name}` : t("Увеличить количество")}
      disabled={disabled} onClick={onAdd ?? onIncrease}><Plus size={onAdd ? 26 : 18} aria-hidden="true" /></button>
  </div>;
}
