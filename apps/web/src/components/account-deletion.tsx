"use client";
import { useEffect, useRef, useState } from "react";
import type { AccountDeletionCapability, AccountDeletionReceipt } from "@dushanbe-fresh/shared";
import { useCustomer } from "@/customer/customer-context";
import { useI18n } from "@/i18n/provider";
import { CustomerError, customerRequest } from "@/lib/customer";

// External deletion-initiation resource required by Google Play. No erasure claim.
export function AccountDeletion() {
  const { locale } = useI18n();
  const customer = useCustomer();
  const text = (ru: string, tg: string) => locale === "tg" ? tg : ru;
  const [capability, setCapability] = useState<AccountDeletionCapability | null>(null);
  const [pending, setPending] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [receipt, setReceipt] = useState<AccountDeletionReceipt | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const requestId = useRef("");
  useEffect(() => {
    let current = true;
    void customerRequest<AccountDeletionCapability>("customer/account-deletion/status").then(value => {
      if (!value || typeof value.available !== "boolean" || value.mode !== "request") throw new Error("Invalid capability");
      if (current) setCapability(value);
    }).catch(error => { if (current) { if (error instanceof CustomerError && error.status === 404) setCapability({ available: false, mode: "request", policyVersion: null, retentionNotice: null }); else setError(true); } }).finally(() => { if (current) setPending(false); });
    return () => { current = false; };
  }, []);
  useEffect(() => { setAccepted(false); }, [customer.user?.id]);
  async function send() {
    if (lock.current || !accepted || !customer.user || !capability?.available) return;
    lock.current = true; setBusy(true); setError(false);
    try {
      requestId.current ||= crypto.randomUUID();
      const value = await customerRequest<AccountDeletionReceipt>("customer/account-deletion", "POST", { requestId: requestId.current, confirmation: "DELETE_ACCOUNT" });
      if (value.status !== "requested" || !Number.isFinite(Date.parse(value.requestedAt))) throw new Error("Invalid receipt");
      setReceipt(value);
      try { await customer.logout(); } finally { void customer.refresh(); }
    } catch { setError(true); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="customer-form" aria-busy={pending || busy}>
    <h1>{text("Удаление аккаунта Dushanbe Fresh", "Нест кардани ҳисоби Dushanbe Fresh")}</h1>
    {pending ? <p role="status">{text("Загрузка", "Боршавӣ")}</p> : receipt ? <>
      <h2>{text("Запрос на удаление принят", "Дархости несткунӣ қабул шуд")}</h2>
      <p>{text("Данные ещё не удалены. Запрос будет обработан по указанным правилам хранения.", "Маълумот ҳанӯз нест нашудааст. Дархост тибқи қоидаҳои нишон додашудаи нигоҳдорӣ коркард мешавад.")}</p>
      <p>{receipt.requestId}</p>
    </> : !capability?.available ? <p>{text("Удаление аккаунта временно недоступно. Попробуйте позже.", "Нест кардани ҳисоб муваққатан дастнорас аст. Баъдтар кӯшиш кунед.")}</p> : <>
      <p>{text("Отправьте запрос на удаление аккаунта и связанных персональных данных.", "Барои нест кардани ҳисоб ва маълумоти шахсии вобаста дархост фиристед.")}</p>
      <p style={{ whiteSpace: "pre-wrap" }}>{capability.retentionNotice?.[locale]}</p>
      {!customer.user ? <button type="button" className="primary-action" disabled={customer.loading} onClick={customer.login}>{text("Войти по номеру телефона", "Бо рақами телефон ворид шудан")}</button> : <>
        <label><input type="checkbox" checked={accepted} disabled={busy} onChange={event => setAccepted(event.target.checked)} /> {text("Я подтверждаю запрос. Все мои устройства выйдут из аккаунта.", "Дархостро тасдиқ мекунам. Ҳамаи дастгоҳҳоям аз ҳисоб мебароянд.")}</label>
        <button type="button" className="primary-action" disabled={!accepted || busy} onClick={() => void send()}>{text("Запросить удаление аккаунта", "Дархости нест кардани ҳисоб")}</button>
      </>}
    </>}
    {error ? <p className="form-error" role="alert">{text("Не удалось завершить запрос. Проверьте соединение и войдите снова.", "Анҷом додани дархост нашуд. Пайвастро санҷед ва аз нав ворид шавед.")}</p> : null}
  </section>;
}
