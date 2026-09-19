"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminWave } from "@dushanbe-fresh/shared";
import { AdminSlot, adminRequest, adminSlotLabel, waveLabels } from "@/lib/operations";
import { slotLabel } from "@/lib/checkout";
import { AdminNotice, StatusBadge, useAdminResource } from "./admin-operations-common";
import { useStaff } from "./staff-layout";
import type { CourierWave } from "./courier-delivery";

export function AdminWaves() {
  const isAdmin = useStaff().role === "admin";
  const isCourier = useStaff().role === "courier";
  const router = useRouter();
  const [date, setDate] = useState("");
  const [slotId, setSlotId] = useState("");
  const slots = useAdminResource<AdminSlot[]>(isAdmin ? `delivery-slots?date=${date}` : null);
  const waves = useAdminResource<Array<AdminWave | CourierWave>>(`delivery-waves?date=${date}`);
  return <>
    <header className="page-heading"><h1>{isAdmin ? "Волны доставки" : isCourier ? "Мои доставки" : "Мои волны"}</h1></header>
    <form className="operations-filters" onSubmit={event => { event.preventDefault(); void waves.run(async () => {
      const wave = await adminRequest<AdminWave>("delivery-waves", "POST", { deliverySlotId: slotId }); router.push(`/admin/delivery-waves/${wave.id}`);
    }); }}>
      <label className="field">Дата доставки<input type="date" value={date} onChange={event => { setDate(event.target.value); setSlotId(""); }} /></label>
      {isAdmin ? <><label className="field">Окно доставки<select required value={slotId} onChange={event => setSlotId(event.target.value)}><option value="">Выберите окно</option>{slots.data?.map(slot => <option value={slot.id} key={slot.id}>{adminSlotLabel(slot)}{slot.wave ? ` · ${waveLabels[slot.wave.status]}` : ""}</option>)}</select></label>
      <div><button type="submit" className="primary-action" aria-describedby={!slotId ? "wave-slot-required" : undefined} disabled={waves.busy || !slotId}>Сформировать волну</button>{!slotId ? <p id="wave-slot-required" className="field-hint">Сначала выберите окно доставки.</p> : null}</div></> : null}<button className="secondary-link" type="button" onClick={() => { waves.reload(); slots.reload(); }}>Обновить</button>
    </form>
    <AdminNotice error={waves.error || slots.error} busy={waves.busy} />
    {!waves.busy && waves.data?.length === 0 ? <p>{isAdmin ? "Волн пока нет." : "На выбранную дату назначенных волн нет."}</p> : null}
    <div className="operations-list">{waves.data?.map(wave => <Link className="operation-list-row" key={wave.id} href={`/admin/delivery-waves/${wave.id}`}><strong>{slotLabel(wave.deliverySlot)}</strong><StatusBadge status={wave.status} label={waveLabels[wave.status]} /><span>Заказов: {wave.orders.filter(order => order.status !== "cancelled").length}</span>{"picker" in wave ? <span>Сборщик: {wave.picker?.name ?? "Не назначен"}</span> : null}<span>Курьер: {wave.courier?.name ?? "Не назначен"}</span></Link>)}</div>
  </>;
}
