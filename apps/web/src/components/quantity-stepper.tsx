"use client";
import { useI18n } from "@/i18n/provider";


import { Minus, Plus } from "lucide-react";
import { decimalLabel } from "@/lib/format";

export function QuantityStepper({ name, quantity, unit, onDecrease, onIncrease, decreaseDisabled = false, disabled = false }: {
  name: string; quantity: string; unit: string;
  onDecrease: () => void; onIncrease: () => void;
  decreaseDisabled?: boolean; disabled?: boolean;
}) {
  const { t, quantityLabel, unitLabel } = useI18n();
  return <div className="quantity-stepper" role="group" aria-label={t(`Количество: ${name}`)}>
    <button type="button" aria-label={t(`Уменьшить количество: ${name}`)} title={t("Уменьшить количество")}
      disabled={disabled || decreaseDisabled} onClick={onDecrease}><Minus size={18} aria-hidden="true" /></button>
    <output aria-live="polite" aria-atomic="true" aria-label={quantityLabel(quantity, unit)} title={quantityLabel(quantity, unit)}>
      <span>{decimalLabel(quantity)}</span>{" "}<span>{unitLabel(unit, quantity)}</span>
    </output>
    <button type="button" aria-label={t(`Увеличить количество: ${name}`)} title={t("Увеличить количество")}
      disabled={disabled} onClick={onIncrease}><Plus size={18} aria-hidden="true" /></button>
  </div>;
}
