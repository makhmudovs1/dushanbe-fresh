"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { StaffDto, VisibleWave } from "@dushanbe-fresh/shared";
import type { Product } from "@/lib/api";
import { adminRequest, orderLabels, waveLabels } from "@/lib/operations";
import { slotLabel } from "@/lib/checkout";
import { AdminNotice, StatusBadge, useAdminResource } from "./admin-operations-common";
import { useStaff } from "./staff-layout";
import { PurchaseEditor } from "./purchase-editor";
import { CourierOrders } from "./courier-delivery";
import { OrderPacking } from "./order-packing";

export function WaveWorkspace({ id }: { id: string }) {
  const user = useStaff();
  const isAdmin = user.roles.includes("admin");
  const resource = useAdminResource<VisibleWave>(`delivery-waves/${id}`, 10000);
  const staff = useAdminResource<StaffDto[]>(isAdmin ? "staff" : null);
  const catalog = useAdminResource<Product[]>(isAdmin || user.roles.includes("picker") ? "picking-products" : null);
  const [tab, setTab] = useState("orders");
  const [productId, setProductId] = useState("");
  const wave = resource.data;
  const hasPurchases = !!wave?.pickingList;
  const status = wave?.status;
  useEffect(() => {
    if (!status) return;
    setTab(["picked", "out_for_delivery", "delivered"].includes(status) ? "delivery" : hasPurchases ? "purchase" : "orders");
  }, [status, hasPurchases]); // Switch to delivery on the same page after finishing picking.
  if (!wave) return <><AdminNotice error={resource.error} busy={resource.busy} /><button className="secondary-link" onClick={resource.reload}>Обновить</button></>;
  const permissions = wave.permissions;
  const action = permissions?.startPicking ? ["picking", "Начать сборку"] : permissions?.finishPicking ? ["picked", "Завершить сборку"] : permissions?.startDelivery ? ["out_for_delivery", "Забрал заказы"] : null;
  const pendingCash = wave.orders.some(order => order.status === "delivered" && order.paymentStatus === "pending");
  return <>
    <Link className="back-link" href="/admin/delivery-waves">Все волны</Link>
    <header className="page-heading"><h1>Волна доставки</h1><p>{slotLabel(wave.deliverySlot)}</p><StatusBadge status={wave.status} label={!hasPurchases && ["open", "picking"].includes(wave.status) ? "Готовится" : waveLabels[wave.status]} /></header>
    <AdminNotice error={resource.error || staff.error || catalog.error} busy={resource.busy} />
    <div className="operations-filters">
      {([['pickerUserId', 'picker', 'Сборщик'], ['courierUserId', 'courier', 'Курьер']] as const).map(([field, role, label]) => {
        const current = wave[role];
        const eligible = staff.data?.filter(person => person.status === "active" && person.roles.includes(role)) ?? [];
        const invalid = current && (current.status !== "active" || !current.roles.includes(role));
        return isAdmin ? <label className="field" key={role}>{label}<select
          disabled={resource.busy || wave.status === "cancelled" || (wave.status === "delivered" && (role === "picker" || !pendingCash))}
          value={current?.id ?? ""} onChange={event => void resource.run(() => adminRequest(`delivery-waves/${id}/assignments`, "PATCH", { [field]: event.target.value || null }))}>
          <option value="">Не назначен</option>
          {current && !eligible.some(person => person.id === current.id) ? <option value={current.id} disabled>{current.name ?? current.id} (недоступен для назначения)</option> : null}
          {eligible.map(person => <option key={person.id} value={person.id}>{person.name ?? person.id}</option>)}
        </select>{invalid ? <span role="status">Сотрудник отключён или роль снята. Выберите замену.</span> : null}</label>
          : <p key={role}>{label}: <strong>{current?.name ?? "Не назначен"}</strong>{invalid ? " (недоступен)" : ""}</p>;
      })}
      {action ? <button className="primary-action" disabled={resource.busy} onClick={() => void resource.run(() => adminRequest(`delivery-waves/${id}/status`, "PATCH", { status: action[0] }))}>{action[1]}</button> : null}
      {isAdmin && ["open", "picking", "picked"].includes(wave.status) ? <button className="secondary-link" disabled={resource.busy} onClick={() => void resource.run(() => adminRequest(`delivery-waves/${id}/status`, "PATCH", { status: "cancelled" }))}>Отменить волну</button> : null}
      <button className="secondary-link" onClick={resource.reload}>Обновить</button>
    </div>
    <dl className="operations-info"><div><dt>Закуплено позиций</dt><dd>{wave.progress.purchased} / {wave.progress.products}</dd></div><div><dt>Упаковано заказов</dt><dd>{wave.progress.packed} / {wave.progress.orders}</dd></div><div><dt>Доставлено</dt><dd>{wave.progress.delivered} / {wave.progress.orders}</dd></div><div><dt>Оплачено</dt><dd>{wave.progress.paid} / {wave.progress.orders}</dd></div></dl>
    {isAdmin && wave.metrics ? <dl className="operations-info">{[["Предварительная выручка по товарам", wave.metrics.estimatedRevenue], ["Финальная выручка по товарам", wave.metrics.finalRevenue], ["Закупочная стоимость", wave.metrics.purchaseCost], ["Валовая маржа по товарам", wave.metrics.grossMargin]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value === null ? "Не рассчитано" : `${value} сомони`}</dd></div>)}</dl> : null}
    <div className="operations-tabs" role="tablist" aria-label="Работа с волной">{[...(hasPurchases ? [["purchase", "Закупить товары"]] : []), ["orders", "Упаковать заказы"], ["delivery", "Доставка"]].map(([value, label]) => <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{label}</button>)}</div>
    {tab === "purchase" && wave.pickingList ? <section className="operations" aria-label="Закупка">
      <h2>Список закупки</h2><div className="picking-grid">{wave.pickingList.map(item => <PurchaseEditor key={`${item.id}:${item.purchasedQuantity}:${item.purchaseUnitPrice}:${item.supplierNote}`} item={item} disabled={resource.busy || !permissions?.purchase}
        save={(body, onSaved) => resource.run(async () => { await adminRequest(`delivery-waves/${id}/items/${item.id}`, "PATCH", body); onSaved(); })} />)}</div>
      {permissions?.purchase ? <form className="operations-filters" onSubmit={event => { event.preventDefault(); void resource.run(() => adminRequest(`delivery-waves/${id}/items`, "POST", { productId })); }}><label className="field">Дополнительный товар для замены<select required value={productId} onChange={event => setProductId(event.target.value)}><option value="">Выберите товар</option>{catalog.data?.filter(product => !wave.pickingList?.some(item => item.productId === product.id)).map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><button className="secondary-link" disabled={resource.busy || !productId}>Добавить в закупку</button></form> : null}
    </section> : tab === "orders" ? <section className="operations"><h2>Упаковать заказы</h2>
      {wave.orders.map(order => <article key={order.id} className="operation-item"><h3><Link href={`/admin/orders/${order.id}`}>{order.orderNumber}</Link></h3><StatusBadge status={order.status} label={orderLabels[order.status]} />
        <OrderPacking order={order} products={catalog.data ?? []} isAdmin={isAdmin} disabled={resource.busy || !permissions?.packing || order.status !== "picking"}
          pack={() => resource.run(() => adminRequest(`orders/${order.id}/pack`, "POST"))}
          saveItem={(itemId, body, onSaved) => resource.run(async () => { await adminRequest(`orders/${order.id}/items/${itemId}`, "PATCH", body); onSaved(); })} />
      </article>)}
    </section> : <section className="operations"><h2>Доставка</h2>{["open", "picking"].includes(wave.status) ? <p>Партия готовится. Получить заказы можно после завершения сборки.</p> : null}
      <CourierOrders orders={wave.orders.filter(order => order.status !== "cancelled")} busy={resource.busy} run={resource.run} canDeliver={permissions?.deliver} />
    </section>}
  </>;
}
