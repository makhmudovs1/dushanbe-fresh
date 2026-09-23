"use client";

import Link from "next/link";
import type { AdminOrder } from "@dushanbe-fresh/shared";
import { Product } from "@/lib/api";
import { adminRequest, dateTime, orderLabels, paymentLabels, policyLabels } from "@/lib/operations";
import { slotLabel } from "@/lib/checkout";
import { AdminNotice, StatusBadge, useAdminResource } from "./admin-operations-common";
import { useStaff } from "./staff-layout";
import { CourierOrderDetail } from "./courier-delivery";
import { OrderPacking } from "./order-packing";

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
  const action = isAdmin ? actions[order.status] : undefined;
  return <>
    <Link className="back-link" href={isAdmin ? "/admin/orders" : "/admin/delivery-waves"}>{isAdmin ? "Все заказы" : "Мои волны"}</Link>
    <header className="page-heading"><h1>Заказ {order.orderNumber}</h1><div><StatusBadge status={order.status} label={orderLabels[order.status]} /> <StatusBadge status={order.paymentStatus} label={paymentLabels[order.paymentStatus]} /></div></header>
    <AdminNotice error={resource.error || catalog.error} busy={resource.busy} />
    <div className="operations-actions">
      {action ? <button className="primary-action" disabled={resource.busy} onClick={() => void resource.run(() => adminRequest(`orders/${id}/status`, "PATCH", { status: action[0] }))}>{action[1]}</button> : null}
      {isAdmin && ["placed", "confirmed", "picking", "picked", "out_for_delivery"].includes(order.status) ? <button className="secondary-link" disabled={resource.busy} onClick={() => void resource.run(() => adminRequest(`orders/${id}/status`, "PATCH", { status: "cancelled" }))}>Отменить заказ</button> : null}
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
    <OrderPacking order={order} products={products} isAdmin={isAdmin} disabled={resource.busy || order.status !== "picking"}
      pack={() => resource.run(() => adminRequest(`orders/${id}/pack`, "POST"))}
      saveItem={(itemId, body, onSaved) => resource.run(async () => { await adminRequest(`orders/${id}/items/${itemId}`, "PATCH", body); onSaved(); })} />
    <dl className="operations-info"><div><dt>Предварительно</dt><dd>{order.totalEstimated} сомони</dd></div><div><dt>Доставка / сервисный сбор</dt><dd>{order.deliveryFee} / {order.serviceFee} сомони</dd></div><div><dt>Скидка</dt><dd>{order.discountTotal} сомони</dd></div><div><dt>Итог клиенту</dt><dd>{order.totalFinal === null ? "Ожидает сборки" : `${order.totalFinal} сомони`}</dd></div></dl>
  </>;
}
