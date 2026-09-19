"use client";

import Link from "next/link";
import { useState } from "react";
import type { AdminOrder, AdminOrderItem, FinalItemInput } from "@dushanbe-fresh/shared";
import { Product } from "@/lib/api";
import { adminRequest, dateTime, itemLabels, orderLabels, paymentLabels, policyLabels } from "@/lib/operations";
import { slotLabel, unitLabel } from "@/lib/checkout";
import { AdminNotice, StatusBadge, useAdminResource } from "./admin-operations-common";
import { useStaff } from "./staff-layout";
import { CourierOrderDetail } from "./courier-delivery";

export function AdminOrderDetail({ id }: { id: string }) {
  const user = useStaff();
  return user.role === "courier" ? <CourierOrderDetail id={id} /> : <PickingOrderDetail id={id} />;
}
function PickingOrderDetail({ id }: { id: string }) {
  const isAdmin = useStaff().role === "admin";
  const resource = useAdminResource<AdminOrder>(`orders/${id}`);
  const catalog = useAdminResource<Product[]>("picking-products");
  const products = catalog.data ?? [];
  const order = resource.data;
  if (!order) return <><AdminNotice error={resource.error} busy={resource.busy} /><button className="secondary-link" onClick={resource.reload}>Обновить</button></>;
  const actions: Record<string, [string, string]> = { placed: ["confirmed", "Подтвердить заказ"], picking: ["picked", "Заказ собран"], out_for_delivery: ["delivered", "Отметить доставленным"] };
  const action = isAdmin || order.status === "picking" ? actions[order.status] : undefined;
  return <>
    <Link className="back-link" href={isAdmin ? "/admin/orders" : "/admin/delivery-waves"}>{isAdmin ? "Все заказы" : "Мои волны"}</Link>
    <header className="page-heading"><h1>Заказ {order.orderNumber}</h1><div><StatusBadge status={order.status} label={orderLabels[order.status]} /> <StatusBadge status={order.paymentStatus} label={paymentLabels[order.paymentStatus]} /></div></header>
    <AdminNotice error={resource.error || catalog.error} busy={resource.busy} />
    <div className="operations-actions">
      {action ? <button className="primary-action" disabled={resource.busy} onClick={() => void resource.run(() => adminRequest(`orders/${id}/status`, "PATCH", { status: action[0] }))}>{action[1]}</button> : null}
      {isAdmin && ["placed", "confirmed", "picking", "picked"].includes(order.status) ? <button className="secondary-link" disabled={resource.busy} onClick={() => void resource.run(() => adminRequest(`orders/${id}/status`, "PATCH", { status: "cancelled" }))}>Отменить заказ</button> : null}
      {isAdmin && order.status === "delivered" && order.paymentStatus === "pending" ? <button className="primary-action" disabled={resource.busy} onClick={() => void resource.run(() => adminRequest(`orders/${id}/paid`, "POST"))}>Наличные получены</button> : null}
      {order.deliveryWaveId ? <Link className="secondary-link" href={`/admin/delivery-waves/${order.deliveryWaveId}`}>Открыть волну</Link> : <Link className="secondary-link" href="/admin/delivery-waves">Волны доставки</Link>}
    </div>
    <dl className="operations-info">
      <div><dt>Клиент</dt><dd>{order.address.recipientName}<br /><a href={`tel:${order.address.phone}`}>{order.address.phone}</a></dd></div>
      <div><dt>Адрес</dt><dd>{order.address.city}, {order.address.street}, {order.address.building}{order.address.apartment && `, кв. ${order.address.apartment}`}{order.address.entrance && `, подъезд ${order.address.entrance}`}{order.address.floor && `, этаж ${order.address.floor}`}<p>{order.address.instructions}</p></dd></div>
      <div><dt>Доставка</dt><dd>{slotLabel(order.deliverySlot)}</dd></div><div><dt>Создан</dt><dd>{dateTime(order.createdAt)}</dd></div>
      <div><dt>Если товара нет</dt><dd>{policyLabels[order.substitutionPolicy]}</dd></div><div><dt>Оплата</dt><dd>{order.paymentMethod === "cash_on_delivery" ? "Наличными при получении" : "Перевод"}, {paymentLabels[order.paymentStatus]}</dd></div>
      <div><dt>Комментарий клиента</dt><dd>{order.customerComment || "Нет"}</dd></div><div><dt>Пожелания по качеству</dt><dd>{order.qualityComment || "Нет"}</dd></div>
    </dl>
    <h2>Товары</h2>
    <div className="operations-items">{order.items.map(item => <OrderItemEditor key={`${item.id}:${item.status}:${item.finalQuantity}:${item.finalUnitPrice}:${item.pickerNote}`} item={item} products={products} disabled={resource.busy || order.status !== "picking"}
      save={body => resource.run(() => adminRequest(`orders/${id}/items/${item.id}`, "PATCH", body))} />)}</div>
    <dl className="operations-info"><div><dt>Предварительно</dt><dd>{order.totalEstimated} сомони</dd></div><div><dt>Доставка / сервисный сбор</dt><dd>{order.deliveryFee} / {order.serviceFee} сомони</dd></div><div><dt>Скидка</dt><dd>{order.discountTotal} сомони</dd></div><div><dt>Итог клиенту</dt><dd>{order.totalFinal === null ? "Ожидает сборки" : `${order.totalFinal} сомони`}</dd></div></dl>
  </>;
}

function OrderItemEditor({ item, products, disabled, save }: { item: AdminOrderItem; products: Product[]; disabled: boolean; save: (body: FinalItemInput) => Promise<void> }) {
  const [form, setForm] = useState<FinalItemInput>({ status: item.status === "requested" ? "picked" : item.status,
    finalQuantity: item.finalQuantity ?? item.requestedQuantity, finalUnitPrice: item.finalUnitPrice ?? item.estimatedPrice,
    replacementProductId: item.replacementProductId ?? "", pickerNote: item.pickerNote ?? "" });
  const excluded = ["removed", "unavailable"].includes(form.status);
  return <article className="operation-item">
    <h3>{item.name}</h3><StatusBadge status={item.status} label={itemLabels[item.status]} />
    <p>Заказано: {item.requestedQuantity} {unitLabel(item.unit)} · {item.qualityPreference ?? "Без предпочтения"}</p>
    <p>Цена при заказе: {item.estimatedPrice} сомони / {unitLabel(item.unit)} · Сумма: {item.estimatedTotal} сомони</p>
    {item.replacementName ? <p>Замена: {item.replacementName}</p> : null}
    <form onSubmit={event => { event.preventDefault(); void save(form); }}><fieldset className="operations-edit-grid" disabled={disabled}>
      <label className="field">Результат сборки<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value as FinalItemInput["status"] })}>{Object.entries(itemLabels).filter(([status]) => status !== "requested").map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label>
      {form.status === "replaced" ? <label className="field">Товар замены<select required value={form.replacementProductId ?? ""} onChange={event => setForm({ ...form, replacementProductId: event.target.value })}><option value="">Выберите товар</option>{products.filter(product => product.id !== item.productId && product.unit === item.unit && product.isActive).map(product => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label> : null}
      {!excluded ? <><label className="field">Фактическое количество, {unitLabel(item.unit)}<input inputMode="decimal" required value={form.finalQuantity} onChange={event => setForm({ ...form, finalQuantity: event.target.value.replace(",", ".") })} /></label><label className="field">Цена клиенту, сомони<input inputMode="decimal" required value={form.finalUnitPrice} onChange={event => setForm({ ...form, finalUnitPrice: event.target.value.replace(",", ".") })} /></label></> : null}
      <label className="field">Примечание сборщика<input maxLength={500} value={form.pickerNote} onChange={event => setForm({ ...form, pickerNote: event.target.value })} /></label>
      <button type="submit" className="primary-action">Сохранить сборку</button>
    </fieldset></form>
    <strong>Итог позиции: {item.finalTotal === null ? "Не рассчитан" : `${item.finalTotal} сомони`}</strong>
  </article>;
}
