"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { AccountDeletionCapability, AccountDeletionReceipt, AccountDeletionRequest } from "@dushanbe-fresh/shared";
import { useCustomer } from "@/customer/customer-context";
import { useI18n } from "@/i18n/provider";
import { CustomerError, customerRequest } from "@/lib/customer";

async function loadCapability(): Promise<AccountDeletionCapability> {
  try {
    const value = await customerRequest<AccountDeletionCapability>("customer/account-deletion/status");
    if (!value || typeof value.available !== "boolean" || value.mode !== "request" || (value.available && (!value.policyVersion || !value.retentionNotice?.ru || !value.retentionNotice?.tg))) throw new Error("Invalid capability");
    return value;
  } catch (error) {
    if (error instanceof CustomerError && error.status === 404) return { available: false, mode: "request", policyVersion: null, retentionNotice: null };
    throw error;
  }
}

// External deletion-initiation resource required by Google Play. No erasure claim.
export function AccountDeletion({ privacyPolicyPublished, supportEmail }: { privacyPolicyPublished: boolean; supportEmail: string | null }) {
  const { locale } = useI18n();
  const customer = useCustomer();
  const text = (ru: string, tg: string) => locale === "tg" ? tg : ru;
  const [capability, setCapability] = useState<AccountDeletionCapability | null>(null);
  const [pending, setPending] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [receipt, setReceipt] = useState<AccountDeletionReceipt | null>(null);
  const [error, setError] = useState(false);
  const [policyChanged, setPolicyChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const requestId = useRef("");
  const currentOwner = useRef(customer.user?.id ?? null);
  const receiptOwner = useRef<string | null>(null);
  currentOwner.current = customer.user?.id ?? null;
  const visibleReceipt = !customer.user || customer.user.id === receiptOwner.current ? receipt : null;
  useEffect(() => {
    let current = true;
    void loadCapability().then(value => {
      if (current) setCapability(value);
    }).catch(error => { if (current) { if (error instanceof CustomerError && error.status === 404) setCapability({ available: false, mode: "request", policyVersion: null, retentionNotice: null }); else setError(true); } }).finally(() => { if (current) setPending(false); });
    return () => { current = false; };
  }, []);
  useEffect(() => {
    setAccepted(false); requestId.current = "";
    if (customer.user?.id && customer.user.id !== receiptOwner.current) setReceipt(null);
  }, [customer.user?.id]);
  async function send() {
    const owner = currentOwner.current, policyVersion = capability?.policyVersion;
    if (lock.current || !accepted || !owner || !capability?.available || !policyVersion) return;
    lock.current = true; setBusy(true); setError(false); setPolicyChanged(false);
    try {
      requestId.current ||= crypto.randomUUID();
      const value = await customerRequest<AccountDeletionReceipt>("customer/account-deletion", "POST", { requestId: requestId.current, confirmation: "DELETE_ACCOUNT", policyVersion, expectedUserId: owner } satisfies AccountDeletionRequest);
      if (currentOwner.current !== owner) return;
      if (value.status !== "requested" || !Number.isFinite(Date.parse(value.requestedAt))) throw new Error("Invalid receipt");
      receiptOwner.current = owner; setReceipt(value);
      // Server already revoked this owner's sessions. A late browser logout could
      // instead clear a different account's cookie after a concurrent tab login.
      void customer.refresh();
    } catch (error) {
      if (currentOwner.current !== owner) return;
      setError(true);
      if (error instanceof CustomerError && error.status === 409) {
        setAccepted(false); setPolicyChanged(true);
        try { setCapability(await loadCapability()); } catch { /* Existing retry message remains visible. */ }
      } else if (error instanceof CustomerError && error.status === 412) {
        setAccepted(false); void customer.refresh();
      }
    }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="customer-form" aria-busy={pending || busy}>
    <h1>{text("Удаление аккаунта Dushanbe Fresh", "Нест кардани ҳисоби Dushanbe Fresh")}</h1>
    <p>{text("Чтобы запросить удаление аккаунта и связанных данных, войдите по номеру телефона и подтвердите запрос на этой странице.", "Барои дархости нест кардани ҳисоб ва маълумоти вобаста, бо рақами телефон ворид шавед ва дархостро дар ҳамин саҳифа тасдиқ кунед.")}</p>
    {pending ? <p role="status">{text("Загрузка", "Боршавӣ")}</p> : visibleReceipt ? <>
      <h2>{text("Запрос на удаление принят", "Дархости несткунӣ қабул шуд")}</h2>
      <p>{text("Данные ещё не удалены. Запрос будет обработан по указанным правилам хранения.", "Маълумот ҳанӯз нест нашудааст. Дархост тибқи қоидаҳои нишон додашудаи нигоҳдорӣ коркард мешавад.")}</p>
      <p>{visibleReceipt.requestId}</p>
    </> : !capability?.available ? <p>{text("Удаление аккаунта временно недоступно. Попробуйте позже.", "Нест кардани ҳисоб муваққатан дастнорас аст. Баъдтар кӯшиш кунед.")}</p> : <>
      <p style={{ whiteSpace: "pre-wrap" }}>{capability.retentionNotice?.[locale]}</p>
      {!customer.user ? <button type="button" className="primary-action" disabled={customer.loading} onClick={customer.login}>{text("Войти по номеру телефона", "Бо рақами телефон ворид шудан")}</button> : <>
        <p>{customer.user.phone}</p>
        <label><input type="checkbox" checked={accepted} disabled={busy} onChange={event => setAccepted(event.target.checked)} /> {text("Я подтверждаю запрос. Все мои устройства выйдут из аккаунта.", "Дархостро тасдиқ мекунам. Ҳамаи дастгоҳҳоям аз ҳисоб мебароянд.")}</label>
        <button type="button" className="primary-action" disabled={!accepted || busy} onClick={() => void send()}>{text("Запросить удаление аккаунта", "Дархости нест кардани ҳисоб")}</button>
      </>}
    </>}
    {error ? <p className="form-error" role="alert">{policyChanged ? text("Правила хранения изменились. Прочитайте их и подтвердите запрос заново.", "Қоидаҳои нигоҳдорӣ тағйир ёфтанд. Онҳоро хонед ва дархостро аз нав тасдиқ кунед.") : text("Не удалось завершить запрос. Проверьте соединение и войдите снова.", "Анҷом додани дархост нашуд. Пайвастро санҷед ва аз нав ворид шавед.")}</p> : null}
    {supportEmail ? <p>{text("Если вы потеряли доступ к номеру, свяжитесь с поддержкой для проверки аккаунта.", "Агар ба рақаматон дастрасӣ надошта бошед, барои санҷиши ҳисоб ба дастгирӣ муроҷиат кунед.")} <a href={`mailto:${supportEmail}`}>{supportEmail}</a></p> : null}
    {privacyPolicyPublished ? <Link href="/privacy">{text("Политика конфиденциальности", "Сиёсати махфият")}</Link> : null}
  </section>;
}
