"use client";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import type { DeliveryZoneState } from "@dushanbe-fresh/shared";
import { AdminNotice, useAdminResource } from "@/components/admin-operations-common";
import { DeliveryZoneEditor } from "@/components/delivery-zone-editor";
import { adminRequest } from "@/lib/operations";

export default function DeliveryZonePage() {
  const resource = useAdminResource<DeliveryZoneState>("settings/delivery-zone");
  return <main className="page"><section className="shell operations">
    <Link className="back-link" href="/admin/settings">Настройки</Link>
    <header className="page-heading"><h1>Зона доставки</h1><button className="catalog-icon-action" type="button" title="Обновить зону" aria-label="Обновить зону" disabled={resource.busy} onClick={resource.reload}><RefreshCw size={20} /></button></header>
    <AdminNotice error={resource.error} busy={resource.busy} />
    {resource.data ? <DeliveryZoneEditor key={resource.data.revision ?? "unset"} initial={resource.data} busy={resource.busy} onSave={state => void resource.run(() => adminRequest("settings/delivery-zone", "PATCH", { zone: state.zone, expectedRevision: state.revision }))} /> : null}
  </section></main>;
}
