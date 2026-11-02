"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { staffFetch } from "@/lib/staff-auth";
import { dateTime } from "@/lib/operations";
import styles from "./sms-usage.module.css";

type UsageWindow = { used: number; limit: number; resetsAt: string };
export type SmsUsage = {
  configured: boolean;
  hour: UsageWindow;
  day: UsageWindow;
  dailyWarning: boolean;
};
type UsageState = { data: SmsUsage | null; error: boolean };
const SmsUsageContext = createContext<UsageState>({ data: null, error: false });

// Mounted only for an authenticated administrator, shared by the banner and settings.
export function SmsUsageProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<UsageState>({ data: null, error: false });
  useEffect(() => {
    let active = true;
    let version = 0;
    let controller: AbortController | undefined;
    const load = async () => {
      const current = ++version;
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await staffFetch("/api/v1/admin/settings/sms-usage", { signal: controller.signal });
        if (!response.ok) throw new Error("SMS usage unavailable");
        const data: SmsUsage = await response.json();
        if (active && current === version) setState({ data, error: false });
      } catch {
        if (active && current === version) setState({ data: null, error: true });
      }
    };
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    void load();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      version++;
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return <SmsUsageContext.Provider value={state}>{children}</SmsUsageContext.Provider>;
}

export function SmsUsageBanner() {
  const { data } = useContext(SmsUsageContext);
  if (!data?.dailyWarning) return null;
  return <div className="shell"><div role="alert" className={styles.banner}>
    <AlertTriangle size={20} aria-hidden="true" />
    <span>SMS: {data.day.used} из {data.day.limit} за сутки. Достигнуто 80% суточного лимита.</span>
    <Link href="/admin/settings#sms">Расход SMS</Link>
  </div></div>;
}

export function SmsUsageSettings() {
  const { data, error } = useContext(SmsUsageContext);
  return <section id="sms" aria-labelledby="sms-heading" className={styles.section}>
    <h2 id="sms-heading">Расход SMS</h2>
    {error ? <p role="alert">Не удалось загрузить расход SMS. Данные обновятся автоматически.</p>
      : !data ? <p role="status">Загружаем расход SMS...</p>
      : <>
        <p role="status">{data.configured ? "Отправка SMS настроена." : "Отправка SMS отключена: конфигурация не готова."}</p>
        <dl className={styles.counts}>
          {([['hour', 'За час'], ['day', 'За сутки']] as const).map(([key, label]) => <div key={key}>
            <dt>{label}</dt><dd><strong>{data[key].used} из {data[key].limit}</strong></dd>
            <dd>Сброс: <time dateTime={data[key].resetsAt}>{dateTime(data[key].resetsAt)}</time> (Душанбе)</dd>
          </div>)}
        </dl>
      </>}
    <p>Учтены попытки обращения к SMS-провайдеру, включая неуспешные и с неизвестным результатом, а не доставленные сообщения.</p>
    <p>Лимиты задаются только через ENV. Денежная стоимость не рассчитана: тариф Payom неизвестен.</p>
  </section>;
}
