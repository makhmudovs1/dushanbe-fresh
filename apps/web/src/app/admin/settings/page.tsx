"use client";

import { AdminNotice, useAdminResource } from "@/components/admin-operations-common";
export default function SettingsPage() {
  const resource = useAdminResource<Array<{ key: string; value: string }>>("settings");
  const labels: Record<string, string> = { minimum_order_amount: "Минимальная сумма товаров", delivery_fee: "Доставка", service_fee: "Сервисный сбор" };
  return <main className="page"><section className="shell operations"><header className="page-heading"><h1>Настройки</h1><p>Текущие условия заказа</p></header>
    <AdminNotice error={resource.error} busy={resource.busy} /><dl className="operations-info">{resource.data?.map(setting => <div key={setting.key}><dt>{labels[setting.key]}</dt><dd>{setting.value} сомони</dd></div>)}</dl>
  </section></main>;
}
