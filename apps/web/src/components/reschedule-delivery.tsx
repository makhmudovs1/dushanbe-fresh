"use client";
import type { DeliveryFinanceDto, DeliverySlotDto } from "@dushanbe-fresh/shared";
import { useEffect, useState } from "react";
import { AdminNotice, useAdminResource } from "./admin-operations-common";
import { adminRequest } from "@/lib/operations";
import { slotLabel } from "@/lib/checkout";
export function RescheduleDelivery({ id, updated }: { id: string; updated: () => void }) {
  const resource = useAdminResource<DeliveryFinanceDto>(`orders/${id}/finances`);
  const [slots, setSlots] = useState<DeliverySlotDto[]>([]); const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/v1/delivery-slots").then(async response => { if (!response.ok) throw new Error("Окна недоступны."); setSlots(await response.json()); }).catch(error => setError(error.message)); }, []);
  return <details><summary>Перенести доставку</summary><AdminNotice error={resource.error || error} busy={resource.busy} />
    <form className="operations-edit-grid" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void resource.run(async () => { await adminRequest(`orders/${id}/reschedule`, "POST", { deliverySlotId: form.get("slot"), note: form.get("note"), version: resource.data?.version }); updated(); }); }}>
      <label className="field">Новое окно<select name="slot" required><option value="">Выберите окно</option>{slots.filter(slot => slot.available).map(slot => <option key={slot.id} value={slot.id}>{slotLabel(slot)}</option>)}</select></label>
      <label className="field">Причина переноса<textarea name="note" required maxLength={500} /></label><button className="primary-action" disabled={resource.busy || !resource.data}>Подтвердить перенос</button>
    </form></details>;
}
