"use client";

import Link from "next/link";
import { useState } from "react";
import type { AdminWave, PickingRow, StaffDto } from "@dushanbe-fresh/shared";
import { Product } from "@/lib/api";
import { adminRequest, orderLabels, paymentLabels, waveLabels } from "@/lib/operations";
import { slotLabel, unitLabel } from "@/lib/checkout";
import { AdminNotice, StatusBadge, useAdminResource } from "./admin-operations-common";
import { useStaff } from "./staff-layout";
import { CourierWaveDetail } from "./courier-delivery";

export function AdminWaveDetail({ id }: { id: string }) {
  const user = useStaff();
  return user.role === "courier" ? <CourierWaveDetail id={id} /> : <PickingWaveDetail id={id} />;
}
function PickingWaveDetail({ id }: { id: string }) {
  const isAdmin = useStaff().role === "admin";
  const resource = useAdminResource<AdminWave>(`delivery-waves/${id}`);
  const staff = useAdminResource<StaffDto[]>(isAdmin ? "staff" : null);
  const [tab, setTab] = useState("purchase");
  const catalog = useAdminResource<Product[]>("picking-products");
  const products = catalog.data ?? [];
  const [productId, setProductId] = useState("");
  const wave = resource.data;
  if (!wave) return <><AdminNotice error={resource.error} busy={resource.busy} /><button className="secondary-link" onClick={resource.reload}>Обновить</button></>;
  const locked = ["out_for_delivery", "delivered", "cancelled"].includes(wave.status);
  const actions: Record<string, [string, string]> = { open: ["picking", "Начать сборку"], picking: ["picked", "Завершить сборку"], picked: ["out_for_delivery", "Передать курьеру"], out_for_delivery: ["delivered", "Завершить доставку"] };
  const action = isAdmin || ["open", "picking"].includes(wave.status) ? actions[wave.status] : undefined;
  return <>
    <Link className="back-link" href="/admin/delivery-waves">Все волны</Link>
    <header className="page-heading"><h1>Волна доставки</h1><p>{slotLabel(wave.deliverySlot)}</p><div><StatusBadge status={wave.status} label={waveLabels[wave.status]} /></div></header>
    <AdminNotice error={resource.error || staff.error || catalog.error} busy={resource.busy} />
    <div className="operations-filters">
      {isAdmin ? ([['pickerUserId', 'picker', 'Сборщик'], ['courierUserId', 'courier', 'Курьер']] as const).map(([field, role, label]) => <label className="field" key={role}>{label}<select disabled={resource.busy || locked} value={wave[role]?.id ?? ""} onChange={event => void resource.run(() => adminRequest(`delivery-waves/${id}/assignments`, "PATCH", { [field]: event.target.value || null }))}><option value="">Не назначен</option>{staff.data?.filter(user => user.role === role).map(user => <option key={user.id} value={user.id}>{user.name ?? user.id}</option>)}</select></label>) : null}
      {action ? <button className="primary-action" disabled={resource.busy} onClick={() => void resource.run(() => adminRequest(`delivery-waves/${id}/status`, "PATCH", { status: action[0] }))}>{action[1]}</button> : null}
      {isAdmin && wave.status === "open" ? <button className="secondary-link" disabled={resource.busy} onClick={() => void resource.run(() => adminRequest("delivery-waves", "POST", { deliverySlotId: wave.deliverySlot.id }))}>Добавить подтверждённые заказы</button> : null}
      {isAdmin && !locked ? <button className="secondary-link" disabled={resource.busy} onClick={() => void resource.run(() => adminRequest(`delivery-waves/${id}/status`, "PATCH", { status: "cancelled" }))}>Отменить волну</button> : null}
      <button className="secondary-link" onClick={resource.reload}>Обновить</button>
    </div>
    <dl className="operations-metrics">{[
      ['Заказов', String(wave.metrics.orderCount)], ['Товаров в закупке', String(wave.metrics.productCount)],
      ['Предварительная выручка по товарам', wave.metrics.estimatedRevenue], ['Финальная выручка по товарам', wave.metrics.finalRevenue],
      ['Закупочная стоимость', wave.metrics.purchaseCost], ['Валовая маржа по товарам', wave.metrics.grossMargin]
    ].map(([label, value], index) => <div key={label}><dt>{label}</dt><dd>{value === null ? "Не рассчитано" : `${value}${index > 1 ? " сомони" : ""}`}</dd></div>)}</dl>
    <div className="operations-tabs" role="tablist" aria-label="Работа с волной">{[["purchase", "Закупка"], ["orders", "Распределение"], ...(isAdmin ? [["delivery", "Доставка"]] : [])].map(([value, label]) => <button role="tab" aria-selected={tab === value} key={value} onClick={() => setTab(value)}>{label}</button>)}</div>
    {tab === "purchase" ? <section className="operations" role="tabpanel" aria-label="Закупка">
      <h2>Список закупки</h2>
      <div className="picking-grid">{wave.pickingList.map((item, index) => <PurchaseEditor key={`${item.id}:${item.purchasedQuantity}:${item.purchaseUnitPrice}:${item.supplierNote}`} item={item} nextId={wave.pickingList[index + 1]?.id} disabled={resource.busy || wave.status !== "picking"} save={body => resource.run(() => adminRequest(`delivery-waves/${id}/items/${item.id}`, "PATCH", body))} />)}</div>
      {wave.status === "picking" ? <form className="operations-filters" onSubmit={event => { event.preventDefault(); void resource.run(() => adminRequest(`delivery-waves/${id}/items`, "POST", { productId })); }}><label className="field">Дополнительный товар для замены<select required value={productId} onChange={event => setProductId(event.target.value)}><option value="">Выберите товар</option>{products.filter(product => product.isActive && product.isAvailableToday && !wave.pickingList.some(item => item.productId === product.id)).map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><button className="secondary-link" disabled={resource.busy || !productId}>Добавить в закупку</button></form> : null}
    </section> : <section className="operations" role="tabpanel" aria-label={tab === "orders" ? "Распределение" : "Доставка"}>
      <h2>{tab === "orders" ? "Распределение по заказам" : "Заказы для курьера"}</h2>
      {wave.orders.map(order => <article className="operation-item" key={order.id}><h3><Link href={`/admin/orders/${order.id}`}>{order.orderNumber}</Link></h3><div><StatusBadge status={order.status} label={orderLabels[order.status]} /> <StatusBadge status={order.paymentStatus} label={paymentLabels[order.paymentStatus]} /></div>
        <p>{order.address.recipientName} · <a href={`tel:${order.address.phone}`}>{order.address.phone}</a></p>
        {tab === "delivery" ? <><p>{order.address.city}, {order.address.street}, {order.address.building}{order.address.apartment && `, кв. ${order.address.apartment}`}{order.address.entrance && `, подъезд ${order.address.entrance}`}{order.address.floor && `, этаж ${order.address.floor}`}</p><p>{order.address.instructions}</p></> : order.items.map(item => <p key={item.id}>{item.name}: {item.requestedQuantity} {unitLabel(item.unit)} · {item.qualityPreference ?? "Без предпочтения"} · Факт: {item.finalQuantity ?? "Не собран"}</p>)}
        <strong>Итог: {order.totalFinal === null ? "Ожидает сборки" : `${order.totalFinal} сомони`}</strong>
        <div className="operations-actions"><Link className="secondary-link" href={`/admin/orders/${order.id}`}>{tab === "orders" ? "Ввести фактические количества" : "Открыть заказ"}</Link>
          {tab === "delivery" && order.status === "out_for_delivery" ? <button className="primary-action" disabled={resource.busy} onClick={() => void resource.run(() => adminRequest(`orders/${order.id}/status`, "PATCH", { status: "delivered" }))}>Доставлен</button> : null}
          {tab === "delivery" && order.status === "delivered" && order.paymentStatus === "pending" ? <button className="primary-action" disabled={resource.busy} onClick={() => void resource.run(() => adminRequest(`orders/${order.id}/paid`, "POST"))}>Наличные получены</button> : null}
        </div>
      </article>)}
    </section>}
  </>;
}

function PurchaseEditor({ item, disabled, save, nextId }: { item: PickingRow; disabled: boolean; nextId?: string; save: (body: unknown) => Promise<void> }) {
  const [form, setForm] = useState({ purchasedQuantity: item.purchasedQuantity ?? "", purchaseUnitPrice: item.purchaseUnitPrice ?? "", supplierNote: item.supplierNote ?? "" });
  return <article className="operation-item purchase-item" id={`purchase-${item.id}`}>
    <h3>{item.name}</h3><strong className="purchase-demand">Нужно: {item.requestedQuantityTotal} {unitLabel(item.unit)}</strong><p>Заказов с товаром: {item.orderCount}</p>
    <ul className="quality-breakdown">{item.qualityPreferences.map(option => <li key={option.label}>{option.label}: <strong>{option.quantity} {unitLabel(item.unit)}</strong></li>)}</ul>
    <form onSubmit={event => { event.preventDefault(); void save(form); }}><fieldset className="operations-edit-grid" disabled={disabled}>
      <label className="field">Купили, {unitLabel(item.unit)}<input required inputMode="decimal" value={form.purchasedQuantity} onChange={event => setForm({ ...form, purchasedQuantity: event.target.value.replace(",", ".") })} /></label>
      <label className="field">Закупочная цена, сомони / {unitLabel(item.unit)}<input required inputMode="decimal" value={form.purchaseUnitPrice} onChange={event => setForm({ ...form, purchaseUnitPrice: event.target.value.replace(",", ".") })} /></label>
      <label className="field">Примечание продавца<input maxLength={500} value={form.supplierNote} onChange={event => setForm({ ...form, supplierNote: event.target.value })} /></label>
      <button className="primary-action" type="submit">{item.purchaseTotal === null ? "Отметить купленным" : "Сохранить закупку"}</button>
    </fieldset></form>
    <strong>Закупка: {item.purchaseTotal === null ? "Не записана" : `${item.purchaseTotal} сомони`}</strong><p>Распределено: {item.allocatedQuantity} {unitLabel(item.unit)}</p>
    {nextId ? <a className="secondary-link" href={`#purchase-${nextId}`}>Следующий товар</a> : null}
  </article>;
}
