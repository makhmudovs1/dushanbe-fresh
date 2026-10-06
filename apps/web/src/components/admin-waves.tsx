"use client";

import Link from "next/link";
import { useState } from "react";
import type { AdminWave } from "@dushanbe-fresh/shared";
import { waveLabels } from "@/lib/operations";
import { slotLabel } from "@/lib/checkout";
import { AdminNotice, StatusBadge, useAdminResource } from "./admin-operations-common";
import { useStaff } from "./staff-layout";
import { CourierWave, courierWaveLabel } from "./courier-delivery";

export function AdminWaves() {
  const user = useStaff();
  const isAdmin = user.roles.includes("admin");
  const isCourier = user.roles.includes("courier") && !user.roles.includes("picker");
  const isPicker = user.roles.includes("picker") && !user.roles.includes("courier") && !isAdmin;
  const [tab, setTab] = useState("upcoming");
  const [date, setDate] = useState("");
  const waves = useAdminResource<Array<AdminWave | CourierWave>>(`delivery-waves?date=${date}${isPicker ? `&tab=${tab}` : ""}`, 10000);
  return <>
    <header className="page-heading"><h1>{isAdmin ? "Волны доставки" : isCourier ? "Мои доставки" : "Мои волны"}</h1></header>
    {isPicker ? <div className="operations-tabs" role="tablist" aria-label="Мои волны">{[["upcoming", "Предстоящие"], ["working", "В работе"], ["completed", "Завершённые"]].map(([value, label]) => <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{label}</button>)}</div> : null}
    <div className="operations-filters">
      <label className="field">Дата доставки<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <button className="secondary-link" type="button" onClick={waves.reload}>Обновить</button>
      {isAdmin ? <Link className="secondary-link" href="/admin/settings">Дежурные сотрудники</Link> : null}
    </div>
    <AdminNotice error={waves.error} busy={waves.busy} />
    {!waves.busy && waves.data?.length === 0 ? <p>{isAdmin ? "Волн пока нет." : "В этой вкладке назначенных волн нет."}</p> : null}
    <div className="operations-list">{waves.data?.map(wave => <Link className="operation-list-row" key={wave.id} href={`/admin/delivery-waves/${wave.id}`}><strong>{slotLabel(wave.deliverySlot)}</strong><StatusBadge status={wave.status} label={isCourier ? courierWaveLabel(wave.status) : waveLabels[wave.status]} /><span>Заказов: {wave.orders.filter(order => order.status !== "cancelled").length}</span>{"picker" in wave ? <span>Сборщик: {wave.picker?.name ?? "Не назначен"}</span> : null}<span>Курьер: {wave.courier?.name ?? "Не назначен"}</span></Link>)}</div>
  </>;
}
