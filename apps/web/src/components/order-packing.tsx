"use client";

import { useState } from "react";
import type { AdminOrder, AdminOrderItem, FinalItemInput } from "@dushanbe-fresh/shared";
import type { Product } from "@/lib/api";
import { itemLabels } from "@/lib/operations";
import { unitLabel } from "@/lib/checkout";

type Props = {
  order: AdminOrder; products: Product[]; disabled: boolean; isAdmin: boolean;
  pack: () => Promise<void>;
  saveItem: (id: string, body: FinalItemInput, onSaved: () => void) => Promise<void>;
};

export function OrderPacking({ order, products, disabled, isAdmin, pack, saveItem }: Props) {
  const packed = order.items.length > 0 && order.totalFinal !== null && order.items.every(item => item.status !== "requested");
  return <div className="order-packing">
    <div className="packing-list">{order.items.map(item => <PackingItem key={`${item.id}:${item.status}:${item.finalQuantity}:${item.finalUnitPrice}:${item.pickerNote}`} item={item} products={products} disabled={disabled} isAdmin={isAdmin} save={(body, onSaved) => saveItem(item.id, body, onSaved)} />)}</div>
    {packed ? <p className="packing-complete" role="status">✓ Заказ упакован</p> : <button className="primary-action" disabled={disabled} onClick={() => void pack()}>Всё упаковано как заказано</button>}
  </div>;
}

function PackingItem({ item, products, disabled, save, isAdmin }: {
  item: AdminOrderItem; products: Product[]; disabled: boolean; isAdmin: boolean;
  save: (body: FinalItemInput, onSaved: () => void) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FinalItemInput>({ status: item.status === "requested" ? "picked" : item.status,
    finalQuantity: item.finalQuantity ?? item.requestedQuantity,
    replacementProductId: item.replacementProductId ?? "", pickerNote: item.pickerNote ?? "" });
  const excluded = ["removed", "unavailable"].includes(form.status);
  return <div className="packing-item">
    <div className="packing-item-heading"><strong>{item.replacementName ?? item.name} — {item.finalQuantity ?? item.requestedQuantity} {unitLabel(item.unit)}{item.status === "picked" || item.status === "replaced" ? " ✓" : ""}</strong>
      <button className="packing-edit" type="button" disabled={disabled} aria-expanded={editing} onClick={() => setEditing(!editing)}>{editing ? "Закрыть" : "Изменить"}</button></div>
    <p className="packing-meta">{item.status === "requested" ? "К упаковке" : itemLabels[item.status]} · Заказано: {item.requestedQuantity} {unitLabel(item.unit)}{item.qualityPreference ? ` · ${item.qualityPreference}` : ""}</p>
    {item.replacementName ? <p className="packing-meta">Вместо: {item.name}</p> : null}
    {item.pickerNote ? <p className="packing-meta">{item.pickerNote}</p> : null}
    {editing ? <form onSubmit={event => { event.preventDefault(); void save(form, () => setEditing(false)); }}><fieldset className="operations-edit-grid" disabled={disabled}>
      <label className="field">Результат сборки<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value as FinalItemInput["status"] })}>{Object.entries(itemLabels).filter(([status]) => status !== "requested").map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label>
      {form.status === "replaced" ? <label className="field">Товар замены<select required value={form.replacementProductId ?? ""} onChange={event => setForm({ ...form, replacementProductId: event.target.value })}><option value="">Выберите товар</option>{products.filter(product => product.id !== item.productId && product.unit === item.unit && product.isActive).map(product => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label> : null}
      {!excluded ? <label className="field">Фактическое количество, {unitLabel(item.unit)}<input inputMode="decimal" required value={form.finalQuantity} onChange={event => setForm({ ...form, finalQuantity: event.target.value.replace(",", ".") })} /></label> : null}
      <label className="field">Примечание сборщика<input maxLength={500} value={form.pickerNote} onChange={event => setForm({ ...form, pickerNote: event.target.value })} /></label>
      <button type="submit" className="primary-action">Сохранить изменение</button>
    </fieldset></form> : null}
    {isAdmin ? <p className="packing-meta">Цена при заказе: {item.estimatedPrice} сом/{unitLabel(item.unit)} · Итог: {item.finalTotal ?? item.estimatedTotal} сом</p> : null}
  </div>;
}
