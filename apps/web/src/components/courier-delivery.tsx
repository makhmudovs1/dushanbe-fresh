"use client";
import Link from "next/link";
import type { AdminOrder, AdminWave } from "@dushanbe-fresh/shared";
import { AdminNotice, StatusBadge, useAdminResource } from "./admin-operations-common";
import { adminRequest, orderLabels, paymentLabels, waveLabels } from "@/lib/operations";
import { slotLabel } from "@/lib/checkout";

export type CourierWave = Pick<AdminWave, "id" | "status" | "deliverySlot" | "courier" | "orders">;
function CourierOrders({ orders, busy, run }: { orders: AdminOrder[]; busy: boolean; run: (action: () => Promise<unknown>) => Promise<void> }) {
  return <div className="operations-list">{orders.map(order => <article className="operation-item" key={order.id}>
    <h2>{order.orderNumber}</h2><div><StatusBadge status={order.status} label={orderLabels[order.status]} /> <StatusBadge status={order.paymentStatus} label={paymentLabels[order.paymentStatus]} /></div>
    <p><strong>{order.address.recipientName}</strong><br /><a href={`tel:${order.address.phone}`}>{order.address.phone}</a></p>
    <p>{order.address.city}, {order.address.street}, {order.address.building}{order.address.apartment && `, кв. ${order.address.apartment}`}{order.address.entrance && `, подъезд ${order.address.entrance}`}{order.address.floor && `, этаж ${order.address.floor}`}</p>
    {order.address.instructions ? <p>{order.address.instructions}</p> : null}
    {order.customerComment ? <p>{order.customerComment}</p> : null}
    <strong>К получению: {order.totalFinal === null ? "Ожидает сборки" : `${order.totalFinal} сомони`}</strong>
    <div className="operations-actions">
      {order.status === "out_for_delivery" ? <button className="primary-action" disabled={busy} onClick={() => void run(() => adminRequest(`orders/${order.id}/status`, "PATCH", { status: "delivered" }))}>Доставлен</button> : null}
      {order.status === "delivered" && order.paymentStatus === "pending" && order.paymentMethod === "cash_on_delivery" ? <button className="primary-action" disabled={busy} onClick={() => void run(() => adminRequest(`orders/${order.id}/paid`, "POST"))}>Наличные получены</button> : null}
    </div>
  </article>)}</div>;
}
export function CourierWaveDetail({ id }: { id: string }) {
  const resource = useAdminResource<CourierWave>(`delivery-waves/${id}`);
  const wave = resource.data;
  return <><Link className="back-link" href="/admin/delivery-waves">Мои доставки</Link><AdminNotice error={resource.error} busy={resource.busy} />
    {wave ? <><header className="page-heading"><h1>Доставка</h1><p>{slotLabel(wave.deliverySlot)}</p><StatusBadge status={wave.status} label={waveLabels[wave.status]} /></header><CourierOrders orders={wave.orders} busy={resource.busy} run={resource.run} /></> : null}
    <button className="secondary-link" onClick={resource.reload}>Обновить</button></>;
}
export function CourierOrderDetail({ id }: { id: string }) {
  const resource = useAdminResource<AdminOrder>(`orders/${id}`);
  return <><Link className="back-link" href="/admin/delivery-waves">Мои доставки</Link><AdminNotice error={resource.error} busy={resource.busy} />
    {resource.data ? <CourierOrders orders={[resource.data]} busy={resource.busy} run={resource.run} /> : null}</>;
}
