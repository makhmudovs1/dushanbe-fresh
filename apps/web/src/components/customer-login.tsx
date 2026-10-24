"use client";
import { FormEvent, useEffect, useState } from "react";
import type { CustomerProfile } from "@dushanbe-fresh/shared";
import { customerRequest } from "@/lib/customer";
import { useI18n } from "@/i18n/provider";
import { CustomerDialog } from "./customer-dialog";

export function CustomerLogin({ onClose, onSuccess, available = true }: { onClose: () => void; onSuccess: (user: CustomerProfile) => void; available?: boolean }) {
  const { t } = useI18n();
  const [phone, setPhone] = useState("+992");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [deadline, setDeadline] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState<CustomerProfile | null>(null);
  const [name, setName] = useState("");
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update(); const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer);
  }, [deadline]);
  async function send() {
    setBusy(true); setError("");
    try {
      const data = await customerRequest<{ challengeId: string; retryAfter: number }>("customer-auth/code", "POST", { phone });
      setChallenge(data.challengeId); setCode(""); setDeadline(Date.now() + data.retryAfter * 1000);
    } catch (error) { setError(error instanceof Error ? error.message : "Не удалось отправить SMS. Попробуйте позже."); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    if (!available) return;
    if (verified) {
      setBusy(true); setError("");
      try { onSuccess(await customerRequest<CustomerProfile>("customer/profile", "PATCH", { name })); }
      catch (error) { setError(error instanceof Error ? error.message : "Не удалось сохранить изменения."); }
      finally { setBusy(false); }
      return;
    }
    if (!challenge) return send();
    setBusy(true); setError("");
    try {
      const user = await customerRequest<CustomerProfile>("customer-auth/verify", "POST", { challengeId: challenge, code });
      setCode("");
      if (user.name?.trim()) onSuccess(user); else setVerified(user);
    }
    catch (error) { setError(error instanceof Error ? error.message : "Не удалось войти. Повторите попытку."); }
    finally { setBusy(false); }
  }
  return <CustomerDialog title={t(verified ? "Как вас зовут?" : "Вход по телефону")} className="customer-login" busy={busy} onClose={onClose}>
    {!available ? <div className="customer-form"><p role="status">{t("Вход по SMS пока недоступен. Можно оформить заказ без входа.")}</p>
      <button type="button" className="primary-action" onClick={onClose}>{t("Продолжить покупки")}</button></div> :
    <form onSubmit={event => void submit(event)} className="customer-form">
      <p className="customer-form__hint">{t(verified ? "Номер подтверждён. Укажите имя для доставки." : "Войдите или создайте аккаунт по номеру телефона")}</p>
      {verified ? <label className="field">{t("Имя")}<input autoFocus autoComplete="name" required disabled={busy} maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label> : <>
      <label className="field">{t("Телефон")}<input type="tel" autoComplete="tel" inputMode="tel" required disabled={busy} maxLength={32} value={phone} readOnly={!!challenge} onChange={event => setPhone(event.target.value)} /></label>
      {challenge ? <>
        <p>{t("Код отправлен на ваш номер")}</p>
        <label className="field">{t("Код из SMS")}<input key={challenge} autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={busy} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} /></label>
        <button className="secondary-link" type="button" disabled={busy || remaining > 0} onClick={() => void send()}>{t("Отправить код снова")}{remaining > 0 ? ` · ${remaining} ${t("сек.")}` : ""}</button>
        <button className="secondary-link" type="button" disabled={busy} onClick={() => { setChallenge(""); setCode(""); setError(""); }}>{t("Изменить номер")}</button>
      </> : null}
      </>}
      {error ? <p className="checkout-error" role="alert">{t(error)}</p> : null}
      <button className="primary-action" disabled={busy} type="submit">{t(busy ? "Подождите..." : verified ? "Продолжить" : challenge ? "Подтвердить номер" : "Получить код")}</button>
    </form>}
  </CustomerDialog>;
}
