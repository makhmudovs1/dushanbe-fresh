"use client";

import { Minus, Plus } from "lucide-react";
import { quantityLabel } from "@/lib/format";

export function QuantityStepper({ name, quantity, unit, onDecrease, onIncrease, decreaseDisabled = false, disabled = false }: {
  name: string; quantity: string; unit: string;
  onDecrease: () => void; onIncrease: () => void;
  decreaseDisabled?: boolean; disabled?: boolean;
}) {
  return <div className="quantity-stepper" role="group" aria-label={`Количество: ${name}`}>
    <button type="button" aria-label={`Уменьшить количество: ${name}`} title="Уменьшить количество"
      disabled={disabled || decreaseDisabled} onClick={onDecrease}><Minus size={18} aria-hidden="true" /></button>
    <output aria-live="polite" aria-atomic="true">{quantityLabel(quantity, unit)}</output>
    <button type="button" aria-label={`Увеличить количество: ${name}`} title="Увеличить количество"
      disabled={disabled} onClick={onIncrease}><Plus size={18} aria-hidden="true" /></button>
  </div>;
}
