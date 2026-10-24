"use client";
import type { AdminOrder, AdminWave, VisibleWave } from "@dushanbe-fresh/shared";
import { StatusBadge } from "./admin-operations-common";
import { orderLabels, paymentLabels, waveLabels } from "@/lib/operations";
import { DeliveryFinancePanel } from "./delivery-finance-panel";

export type CourierWave = VisibleWave;
export function courierWaveLabel(status: AdminWave["status"]) {
  return ["open", "picking"].includes(status) ? "Готовится" : status === "picked" ? "Готова к получению" : waveLabels[status];
}
export function CourierOrders({ orders, run, canDeliver = false }: { orders: AdminOrder[]; busy: boolean; canDeliver?: boolean; run: (action: () => Promise<unknown>) => Promise<void> }) {
  return <div className="operations-list">{orders.map(order => <article className="operation-item" key={order.id}>
    <h2>{order.orderNumber}</h2><div><StatusBadge status={order.status} label={orderLabels[order.status]} /> <StatusBadge status={order.paymentStatus} label={paymentLabels[order.paymentStatus]} /></div>
    {order.orderKind === "service_recovery" ? <p>Замена по обращению клиента, без новых сборов</p> : order.requiresPicking === false ? <p>Повторная попытка доставки</p> : null}
    <p><strong>{order.address.recipientName}</strong><br /><a href={`tel:${order.address.phone}`}>{order.address.phone}</a></p>
    <p>{order.address.city}, {order.address.street}, {order.address.building}{order.address.apartment && `, кв. ${order.address.apartment}`}{order.address.entrance && `, подъезд ${order.address.entrance}`}{order.address.floor && `, этаж ${order.address.floor}`}</p>
    {order.address.intercom ? <p>Домофон: {order.address.intercom}</p> : null}
    {order.address.instructions ? <p>{order.address.instructions}</p> : null}
    {typeof order.address.latitude === "number" && typeof order.address.longitude === "number" && Number.isFinite(order.address.latitude) && Number.isFinite(order.address.longitude) ? <p><a target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${order.address.latitude},${order.address.longitude}`}>Открыть навигацию</a></p> : null}
    {order.customerComment ? <p>{order.customerComment}</p> : null}
    {canDeliver ? <DeliveryFinancePanel id={order.id} updated={() => void run(async () => undefined)} /> : <strong>После упаковки: {order.totalFinal === null ? "Ожидает сборки" : `${order.totalFinal} сомони`}</strong>}
  </article>)}</div>;
}
