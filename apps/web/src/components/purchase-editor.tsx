"use client";

import { useRef, useState } from "react";
import type { PickingRow } from "@dushanbe-fresh/shared";
import { decimalLabel, priceLabel, quantityLabel, unitLabel } from "@/lib/format";

export function PurchaseEditor({ item, disabled, save }: { item: PickingRow; disabled: boolean; save: (body: unknown, onSaved: () => void) => Promise<void> }) {
  const details = useRef<HTMLDetailsElement>(null);
  const [form, setForm] = useState({ purchasedQuantity: item.purchasedQuantity ?? "", purchaseUnitPrice: item.purchaseUnitPrice ?? "", supplierNote: item.supplierNote ?? "" });
  return <details ref={details} className="operation-item purchase-item" open={item.purchaseTotal === null} id={`purchase-${item.id}`}>
    <summary><span className="purchase-title">{item.purchaseTotal !== null ? <span aria-label="Закупка сохранена">✓ </span> : null}<strong>{item.name}</strong></span>{item.purchaseTotal !== null ? <><span className="purchase-equation">{quantityLabel(item.purchasedQuantity, item.unit)} × {decimalLabel(item.purchaseUnitPrice)} сом/{unitLabel(item.unit)} = {decimalLabel(item.purchaseTotal)} сом</span><span className="purchase-equation">Куплено: {quantityLabel(item.purchasedQuantity, item.unit)} · Нужно клиентам: {quantityLabel(item.requestedQuantityTotal, item.unit)} · Упаковано: {quantityLabel(item.allocatedQuantity, item.unit)} · Остаток: {quantityLabel(item.remainingQuantity, item.unit)}</span><span className="purchase-edit">Изменить</span></> : null}{item.purchaseReviewMessage ? <span className="purchase-review">{item.purchaseReviewMessage}</span> : null}</summary>
    <div className="purchase-content"><p><strong>Нужно: {quantityLabel(item.requestedQuantityTotal, item.unit)}</strong></p>
    <ul className="quality-breakdown">{item.qualityPreferences.map(option => <li key={option.label}>Предпочтение: {option.label} ({quantityLabel(option.quantity, item.unit)})</li>)}</ul>
    <p>Ориентир рынка: {item.referencePurchasePrice === null ? "Не зафиксирован" : `~${priceLabel(item.referencePurchasePrice, item.unit)}`}</p>
    <form onSubmit={event => { event.preventDefault(); void save(form, () => { if (details.current) details.current.open = false; }); }}><fieldset className="operations-edit-grid" disabled={disabled}>
      <label className="field">Куплено, {unitLabel(item.unit)}<input required inputMode="decimal" value={form.purchasedQuantity} onChange={event => setForm({ ...form, purchasedQuantity: event.target.value.replace(",", ".") })} /></label>
      <label className="field">Цена закупки за 1 {unitLabel(item.unit)}, сом<input required inputMode="decimal" value={form.purchaseUnitPrice} onChange={event => setForm({ ...form, purchaseUnitPrice: event.target.value.replace(",", ".") })} /></label>
      <label className="field">Примечание продавца<input maxLength={500} value={form.supplierNote} onChange={event => setForm({ ...form, supplierNote: event.target.value })} /></label>
      <button className="primary-action" type="submit">{item.purchaseTotal === null ? "Отметить купленным" : "Сохранить закупку"}</button>
    </fieldset></form>
    <p>Упаковано: {quantityLabel(item.allocatedQuantity, item.unit)} · Остаток: {item.remainingQuantity === null ? "Закупка не введена" : quantityLabel(item.remainingQuantity, item.unit)}</p></div>
  </details>;
}
