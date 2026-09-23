"use client";

import Link from "next/link";
import { useState } from "react";
import type { AdminOrder, OrderStatus } from "@dushanbe-fresh/shared";
import { AdminNotice, StatusBadge, useAdminResource } from "./admin-operations-common";
import { AdminSlot, adminSlotLabel, dateTime, orderLabels, paymentLabels } from "@/lib/operations";
import { slotLabel } from "@/lib/checkout";

export function AdminOrders() {
  const tabs: Record<string, { label: string; statuses: OrderStatus[] }> = {
    active: { label: "Активные", statuses: ["confirmed", "picking", "picked", "out_for_delivery"] },
    completed: { label: "Завершённые", statuses: ["delivered"] }, cancelled: { label: "Отменённые", statuses: ["cancelled"] }
  };
  const [tab, setTab] = useState("active");
  const [filters, setFilters] = useState({ date: "", deliverySlotId: "", status: "" });
  const [query, setQuery] = useState("");
  const resource = useAdminResource<AdminOrder[]>(`orders?tab=${tab}&${query}`, 10000);
  const slots = useAdminResource<AdminSlot[]>("delivery-slots");
  return <>
    <header className="page-heading"><h1>Заказы</h1></header>
    <div className="operations-tabs" role="tablist" aria-label="Заказы">{Object.entries(tabs).map(([value, { label }]) => <button key={value} role="tab" aria-selected={tab === value} onClick={() => {
      setTab(value); setFilters({ ...filters, status: "" });
      const next = new URLSearchParams(query); next.delete("status"); setQuery(next.toString());
    }}>{label}</button>)}</div>
    <form className="operations-filters" onSubmit={event => { event.preventDefault(); setQuery(new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString()); resource.reload(); }}>
      <label className="field">Дата доставки<input type="date" value={filters.date} onChange={event => setFilters({ ...filters, date: event.target.value, deliverySlotId: "" })} /></label>
      <label className="field">Окно доставки<select value={filters.deliverySlotId} onChange={event => setFilters({ ...filters, deliverySlotId: event.target.value })}><option value="">Все окна</option>{slots.data?.filter(slot => !filters.date || slot.date.slice(0, 10) === filters.date).map(slot => <option key={slot.id} value={slot.id}>{adminSlotLabel(slot)}</option>)}</select></label>
      <label className="field">Статус<select value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}><option value="">Все статусы</option>{tabs[tab].statuses.map(value => <option value={value} key={value}>{orderLabels[value]}</option>)}</select></label>
      <button className="primary-action" type="submit">Показать</button><button className="secondary-link" type="button" onClick={resource.reload}>Обновить</button>
    </form>
    <AdminNotice error={resource.error || slots.error} busy={resource.busy} />
    {!resource.busy && resource.data?.length === 0 ? <div className="staff-empty"><h2>На выбранную дату заказов нет</h2><p>Измените дату или фильтры.</p></div> : null}
    <div className="operations-table-scroll"><table className="operations-table"><thead><tr><th>Заказ</th><th>Дата и окно доставки</th><th>Клиент</th><th>Создан</th><th>Позиций</th><th>Предварительно</th><th>Оплата</th><th>Статус</th></tr></thead><tbody>
      {resource.data?.map(order => <tr key={order.id}><td><Link href={`/admin/orders/${order.id}`}>{order.orderNumber}</Link></td><td>{slotLabel(order.deliverySlot)}</td><td>{order.address.recipientName}<br /><a href={`tel:${order.address.phone}`}>{order.address.phone}</a></td><td>{dateTime(order.createdAt)}</td><td>{order.items.length}</td><td>{order.totalEstimated} сомони</td><td><StatusBadge status={order.paymentStatus} label={paymentLabels[order.paymentStatus]} /></td><td><StatusBadge status={order.status} label={orderLabels[order.status]} /></td></tr>)}
    </tbody></table></div>
  </>;
}
