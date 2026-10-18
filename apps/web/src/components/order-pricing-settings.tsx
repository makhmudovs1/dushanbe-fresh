"use client";

import { useState } from "react";
import { adminRequest } from "@/lib/operations";

const fields = [
  ["minimumOrderAmount", "minimum_order_amount", "Минимальная сумма заказа, сомони"],
  ["deliveryFee", "delivery_fee", "Стоимость доставки, сомони"],
  ["serviceFee", "service_fee", "Сервисный сбор, сомони"]
] as const;

export function OrderPricingSettings({ settings, busy, run }: {
  settings: Array<{ key: string; value: unknown }> | null;
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [saved, setSaved] = useState(false);
  if (!settings) return null;
  const values = fields.map(([, key]) => {
    const value = settings.find(setting => setting.key === key)?.value;
    return typeof value === "string" ? value : "";
  });
  const missing = values.some(value => !/^\d{1,10}(\.\d{1,2})?$/.test(value));
  const percentage = settings.find(setting => setting.key === "service_fee_percent")?.value;
  return <section aria-labelledby="order-pricing-heading">
    <h2 id="order-pricing-heading">Условия заказа</h2>
    {missing ? <p role="status" className="notice">Условия заказа не настроены. Заполните все три суммы, чтобы включить оформление заказов.</p> : null}
    {Number(percentage) > 0 ? <p className="notice">Действует сервисный сбор {String(percentage)}%. Фиксированная сумма применяется при ставке 0% в разделе «Расчёты при доставке».</p> : null}
    <form key={JSON.stringify(values)} className="operations-edit-grid" onChange={() => setSaved(false)} onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const payload = Object.fromEntries(fields.map(([name]) => [name, String(form.get(name)).trim().replace(",", ".")]));
      setSaved(false);
      void run(async () => {
        await adminRequest("settings/order-pricing", "PATCH", payload);
        setSaved(true);
      });
    }}>
      {fields.map(([name, , label], index) => <label className="field" key={name}>{label}
        <input name={name} required inputMode="decimal" pattern="[0-9]{1,10}([.,][0-9]{1,2})?" maxLength={13} defaultValue={values[index]} disabled={busy} />
      </label>)}
      <button className="primary-action" disabled={busy}>Сохранить условия заказа</button>
    </form>
    {saved ? <p role="status">Условия заказа сохранены.</p> : null}
  </section>;
}
