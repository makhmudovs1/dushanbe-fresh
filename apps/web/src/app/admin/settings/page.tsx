"use client";

import { AdminNotice, useAdminResource } from "@/components/admin-operations-common";
import { useState } from "react";
import Link from "next/link";
import { adminRequest } from "@/lib/operations";
import type { StaffDto } from "@dushanbe-fresh/shared";
import { OrderPricingSettings } from "@/components/order-pricing-settings";
export default function SettingsPage() {
  const resource = useAdminResource<Array<{ key: string; value: string }>>("settings");
  const [threshold, setThreshold] = useState<string | null>(null);
  const staff = useAdminResource<StaffDto[]>("staff");
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  return <main className="page"><section className="shell operations"><header className="page-heading"><h1>Настройки</h1><p>Текущие условия заказа</p></header>
    <AdminNotice error={resource.error} busy={resource.busy} />
    <OrderPricingSettings settings={resource.data} busy={resource.busy} run={resource.run} />
    <p><Link className="secondary-link" href="/admin/settings/delivery-zone">Зона доставки</Link></p>
    <form className="operations-filters" onSubmit={event => { event.preventDefault(); void resource.run(() => adminRequest("settings/purchase-price-deviation", "PATCH", { value: threshold ?? resource.data?.find(setting => setting.key === "purchase_price_deviation_percent")?.value ?? "15" })); }}>
      <label className="field">Порог отклонения закупочной цены, %<input required inputMode="decimal" value={threshold ?? resource.data?.find(setting => setting.key === "purchase_price_deviation_percent")?.value ?? "15"} onChange={event => setThreshold(event.target.value.replace(",", "."))} /></label>
      <button className="primary-action" disabled={resource.busy || !resource.data}>Сохранить порог</button>
    </form>
    <h2>Дежурные сотрудники</h2>
    <p><Link className="secondary-link" href="/admin/settings/staff">Сотрудники</Link></p>
    <AdminNotice error={staff.error} busy={staff.busy} />
    <form className="operations-filters" onSubmit={event => { event.preventDefault(); void resource.run(() => adminRequest("settings/default-staff", "PATCH", {
      pickerUserId: defaults.picker ?? resource.data?.find(setting => setting.key === "default_picker_id")?.value ?? "",
      courierUserId: defaults.courier ?? resource.data?.find(setting => setting.key === "default_courier_id")?.value ?? ""
    })); }}>
      {([['picker', 'Дежурный сборщик'], ['courier', 'Дежурный курьер']] as const).map(([role, label]) => {
        const value = defaults[role] ?? resource.data?.find(setting => setting.key === `default_${role}_id`)?.value ?? "";
        const eligible = staff.data?.filter(person => person.status === "active" && person.roles.includes(role)) ?? [];
        const invalid = !!staff.data && !!value && !eligible.some(person => person.id === value);
        return <label className="field" key={role}>{label}<select value={value} onChange={event => setDefaults({ ...defaults, [role]: event.target.value })}>
          <option value="">Не назначен</option>
          {invalid ? <option value={value} disabled>{staff.data?.find(person => person.id === value)?.name ?? "Сотрудник"} (недоступен)</option> : null}
          {eligible.map(person => <option key={person.id} value={person.id}>{person.name ?? person.id}</option>)}
        </select>{invalid ? <span role="status">Сотрудник отключён или роль снята. Новые волны не назначаются ему. Выберите замену.</span> : null}</label>;
      })}
      <button className="primary-action" disabled={resource.busy || !resource.data || !staff.data}>Сохранить дежурных</button>
    </form>
    <FinancePolicy />
  </section></main>;
}

function FinancePolicy() {
  const resource = useAdminResource<Array<{ key: string; value: string | boolean }>>("settings");
  const rate = String(resource.data?.find(row => row.key === "service_fee_percent")?.value ?? "0");
  const keep = resource.data?.find(row => row.key === "customer_refusal_keep_fees")?.value !== false;
  return <section><h2>Расчёты при доставке</h2><AdminNotice error={resource.error} busy={resource.busy} />
    {resource.data ? <form key={`${rate}:${keep}`} className="operations-edit-grid" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void resource.run(() => adminRequest("settings/delivery-finance", "PATCH", { serviceFeePercent: String(form.get("rate")).replace(",", "."), keepCustomerFees: form.get("keep") === "on", note: form.get("note") })); }}>
      <label className="field">Сервисный сбор, % (0 = фиксированный сбор)<input required name="rate" inputMode="decimal" defaultValue={rate} /></label>
      <label className="staff-checkbox"><input name="keep" type="checkbox" defaultChecked={keep} />Сохранять сервисный сбор и доставку при отказе без ошибки сервиса</label>
      <label className="field">Причина изменения<textarea name="note" required maxLength={500} /></label>
      <button className="primary-action" disabled={resource.busy}>Сохранить условия</button>
    </form> : null}</section>;
}
