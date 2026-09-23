"use client";

import { AdminNotice, useAdminResource } from "@/components/admin-operations-common";
import { useState } from "react";
import { adminRequest } from "@/lib/operations";
import type { StaffDto } from "@dushanbe-fresh/shared";
export default function SettingsPage() {
  const resource = useAdminResource<Array<{ key: string; value: string }>>("settings");
  const [threshold, setThreshold] = useState<string | null>(null);
  const staff = useAdminResource<StaffDto[]>("staff");
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const labels: Record<string, string> = { minimum_order_amount: "Минимальная сумма товаров", delivery_fee: "Доставка", service_fee: "Сервисный сбор" };
  return <main className="page"><section className="shell operations"><header className="page-heading"><h1>Настройки</h1><p>Текущие условия заказа</p></header>
    <AdminNotice error={resource.error} busy={resource.busy} /><dl className="operations-info">{resource.data?.filter(setting => setting.key in labels).map(setting => <div key={setting.key}><dt>{labels[setting.key]}</dt><dd>{setting.value} сомони</dd></div>)}</dl>
    <form className="operations-filters" onSubmit={event => { event.preventDefault(); void resource.run(() => adminRequest("settings/purchase-price-deviation", "PATCH", { value: threshold ?? resource.data?.find(setting => setting.key === "purchase_price_deviation_percent")?.value ?? "15" })); }}>
      <label className="field">Порог отклонения закупочной цены, %<input required inputMode="decimal" value={threshold ?? resource.data?.find(setting => setting.key === "purchase_price_deviation_percent")?.value ?? "15"} onChange={event => setThreshold(event.target.value.replace(",", "."))} /></label>
      <button className="primary-action" disabled={resource.busy || !resource.data}>Сохранить порог</button>
    </form>
    <h2>Дежурные сотрудники</h2>
    <AdminNotice error={staff.error} busy={staff.busy} />
    <form className="operations-filters" onSubmit={event => { event.preventDefault(); void resource.run(() => adminRequest("settings/default-staff", "PATCH", {
      pickerUserId: defaults.picker ?? resource.data?.find(setting => setting.key === "default_picker_id")?.value ?? "",
      courierUserId: defaults.courier ?? resource.data?.find(setting => setting.key === "default_courier_id")?.value ?? ""
    })); }}>
      {([['picker', 'Дежурный сборщик'], ['courier', 'Дежурный курьер']] as const).map(([role, label]) => <label className="field" key={role}>{label}<select value={defaults[role] ?? resource.data?.find(setting => setting.key === `default_${role}_id`)?.value ?? ""} onChange={event => setDefaults({ ...defaults, [role]: event.target.value })}><option value="">Не назначен</option>{staff.data?.filter(person => person.role === role).map(person => <option key={person.id} value={person.id}>{person.name ?? person.id}</option>)}</select></label>)}
      <button className="primary-action" disabled={resource.busy || !resource.data || !staff.data}>Сохранить дежурных</button>
    </form>
  </section></main>;
}
