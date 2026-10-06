"use client";

import Link from "next/link";
import type { AdminOrder, VisibleWave } from "@dushanbe-fresh/shared";
import { Product } from "@/lib/api";
import { adminRequest, dateTime, orderLabels, paymentLabels, policyLabels } from "@/lib/operations";
import { slotLabel } from "@/lib/checkout";
import { AdminNotice, StatusBadge, useAdminResource } from "./admin-operations-common";
import { useStaff } from "./staff-layout";
import { OrderPacking } from "./order-packing";
import { DeliveryFinancePanel } from "./delivery-finance-panel";
import { OrderAudit } from "./delivery-backoffice";
import { RescheduleDelivery } from "./reschedule-delivery";

export function AdminOrderDetail({ id }: { id: string }) {
  return <PickingOrderDetail id={id} />;
}
function PickingOrderDetail({ id }: { id: string }) {
  const user = useStaff();
  const isAdmin = user.roles.includes("admin");
  const resource = useAdminResource<AdminOrder>(`orders/${id}`, 10000);
  const wave = useAdminResource<VisibleWave>(resource.data?.deliveryWaveId ? `delivery-waves/${resource.data.deliveryWaveId}` : null, 10000);
  const catalog = useAdminResource<Product[]>(isAdmin || user.roles.includes("picker") ? "picking-products" : null);
  const products = catalog.data ?? [];
  const order = resource.data;
  if (!order) return <><AdminNotice error={resource.error} busy={resource.busy} /><button className="secondary-link" onClick={resource.reload}>Обновить</button></>;
  const actions: Record<string, [string, string]> = { pending_review: ["confirmed", "Подтвердить заказ"], placed: ["confirmed", "Подтвердить заказ"], picking: ["picked", "Заказ собран"] };
  const action = isAdmin ? actions[order.status] : undefined;
  return <>
    <Link className="back-link" href={isAdmin ? "/admin/orders" : "/admin/delivery-waves"}>{isAdmin ? "Все заказы" : "Мои волны"}</Link>
    <header className="page-heading"><h1>Заказ {order.orderNumber}</h1><div><StatusBadge status={order.status} label={orderLabels[order.status]} /> <StatusBadge status={order.paymentStatus} label={paymentLabels[order.paymentStatus]} /></div></header>
    {order.orderKind === "service_recovery" ? <p>Замена по обращению клиента. Сервисный сбор и доставка не начисляются.</p> : null}
    <AdminNotice error={resource.error || catalog.error || wave.error} busy={resource.busy} />
    <div className="operations-actions">
      {action ? <button className="primary-action" disabled={resource.busy} onClick={() => void resource.run(() => adminRequest(`orders/${id}/status`, "PATCH", { status: action[0] }))}>{action[1]}</button> : null}
      {isAdmin && ["pending_review", "placed", "confirmed", "picking", "picked"].includes(order.status) ? <button className="secondary-link" disabled={resource.busy} onClick={() => void resource.run(() => adminRequest(`orders/${id}/status`, "PATCH", { status: "cancelled" }))}>{order.status === "pending_review" ? "Отклонить заказ" : "Отменить заказ"}</button> : null}
      {order.deliveryWaveId ? <Link className="secondary-link" href={`/admin/delivery-waves/${order.deliveryWaveId}`}>Открыть волну</Link> : <Link className="secondary-link" href="/admin/delivery-waves">Волны доставки</Link>}
    </div>
    <dl className="operations-info">
      <div><dt>Клиент</dt><dd>{order.address.recipientName}<br /><a href={`tel:${order.address.phone}`}>{order.address.phone}</a></dd></div>
      <div><dt>Адрес</dt><dd>{order.address.city}, {order.address.street}, {order.address.building}{order.address.apartment && `, кв. ${order.address.apartment}`}{order.address.entrance && `, подъезд ${order.address.entrance}`}{order.address.floor && `, этаж ${order.address.floor}`}<p>{order.address.instructions}</p></dd></div>
      <div><dt>Доставка</dt><dd>{slotLabel(order.deliverySlot)}</dd></div><div><dt>Создан</dt><dd>{dateTime(order.createdAt)}</dd></div>
      <div><dt>Если товара нет</dt><dd>{policyLabels[order.substitutionPolicy]}</dd></div><div><dt>Оплата</dt><dd>{order.paymentMethod === "cash_on_delivery" ? "Наличными при получении" : "Перевод"}, {paymentLabels[order.paymentStatus]}</dd></div>
      <div><dt>Комментарий клиента</dt><dd>{order.customerComment || "Нет"}</dd></div><div><dt>Пожелания по качеству</dt><dd>{order.qualityComment || "Нет"}</dd></div>
    </dl>
    {isAdmin && ["out_for_delivery", "pending_review"].includes(order.status) ? <RescheduleDelivery id={id} updated={resource.reload} /> : null}
    {(isAdmin || wave.data?.permissions?.deliver) && ["out_for_delivery", "delivered"].includes(order.status) ? <DeliveryFinancePanel id={id} expanded updated={resource.reload} /> : null}
    {isAdmin ? <OrderAudit id={id} /> : null}
    <h2>Товары</h2>
    <OrderPacking order={order} products={products} isAdmin={isAdmin} disabled={resource.busy || order.status !== "picking" || !wave.data?.permissions?.packing}
      pack={() => resource.run(() => adminRequest(`orders/${id}/pack`, "POST"))}
      saveItem={(itemId, body, onSaved) => resource.run(async () => { await adminRequest(`orders/${id}/items/${itemId}`, "PATCH", body); onSaved(); })} />
    <dl className="operations-info"><div><dt>При оформлении</dt><dd>{order.totalEstimated} сомони</dd></div><div><dt>Исходные доставка / сервисный сбор</dt><dd>{order.deliveryFee} / {order.serviceFee} сомони</dd></div><div><dt>Исходная скидка</dt><dd>{order.discountTotal} сомони</dd></div><div><dt>После упаковки, до корректировок</dt><dd>{order.totalFinal === null ? "Ожидает сборки" : `${order.totalFinal} сомони`}</dd></div></dl>
  </>;
}
