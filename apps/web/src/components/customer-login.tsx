"use client";
import Image from "next/image";
import { ArrowLeft, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { CustomerProfile } from "@dushanbe-fresh/shared";
import { customerRequest } from "@/lib/customer";
import { CUSTOMER_OTP_LENGTH, formatNationalPhone, nationalPhone } from "@/lib/customer-login";
import { useI18n } from "@/i18n/provider";
import { CustomerDialog } from "./customer-dialog";

export function CustomerLogin({ onClose, onSuccess, available = true, requiredForCheckout = false }: { onClose: () => void; onSuccess: (user: CustomerProfile) => void; available?: boolean; requiredForCheckout?: boolean }) {
  const { t } = useI18n();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [deadline, setDeadline] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState<CustomerProfile | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const lock = useRef(false);
  const attempted = useRef("");
  const sentPhone = useRef("");
  const phoneInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const step = verified ? "name" : challenge ? "code" : "phone";
  const title = step === "name" ? "Как к вам обращаться?" : step === "code" ? "Введите код" : "Введите номер телефона";
  const displayPhone = `+992 ${formatNationalPhone(phone)}`;

  useEffect(() => {
    if (available && !busy) (step === "phone" ? phoneInput : step === "code" ? codeInput : nameInput).current?.focus({ preventScroll: true });
  }, [step, available, busy]);
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update(); const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer);
  }, [deadline]);

  async function send() {
    if (lock.current || phone.length !== 9 || !available || (sentPhone.current === phone && remaining > 0)) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const data = await customerRequest<{ challengeId: string; retryAfter: number }>("customer-auth/code", "POST", { phone: `+992${phone}` });
      sentPhone.current = phone; attempted.current = "";
      setChallenge(data.challengeId); setCode(""); setDeadline(Date.now() + data.retryAfter * 1000);
    } catch (error) { setError(error instanceof Error ? error.message : "Не удалось отправить SMS. Попробуйте позже."); }
    finally { lock.current = false; setBusy(false); }
  }
  const verify = useCallback(async (value: string) => {
    const key = `${challenge}:${value}`;
    if (lock.current || !available || !challenge || value.length !== CUSTOMER_OTP_LENGTH || attempted.current === key) return;
    attempted.current = key; lock.current = true; setBusy(true); setError("");
    try {
      const user = await customerRequest<CustomerProfile>("customer-auth/verify", "POST", { challengeId: challenge, code: value });
      setCode("");
      if (user.name?.trim()) onSuccess(user); else setVerified(user);
    } catch (error) { setError(error instanceof Error ? error.message : "Не удалось войти. Повторите попытку."); }
    finally { lock.current = false; setBusy(false); }
  }, [available, challenge, onSuccess]);
  useEffect(() => { if (step === "code" && code.length === CUSTOMER_OTP_LENGTH) void verify(code); }, [code, step, verify]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!available || lock.current) return;
    if (step === "phone") return send();
    if (step === "code") return verify(code);
    lock.current = true; setBusy(true); setError("");
    try { onSuccess(await customerRequest<CustomerProfile>("customer/profile", "PATCH", { firstName: firstName.trim(), lastName: lastName.trim() })); }
    catch (error) { setError(error instanceof Error ? error.message : "Не удалось сохранить изменения."); }
    finally { lock.current = false; setBusy(false); }
  }
  function back() {
    if (lock.current) return;
    if (step === "code") { setChallenge(""); setCode(""); setError(""); attempted.current = ""; }
    else onClose();
  }
  const header = <>
    <button className="customer-login__back" type="button" onClick={back} disabled={busy}
      title={t(step === "code" ? "Изменить номер" : "Закрыть форму")} aria-label={t(step === "code" ? "Изменить номер" : "Закрыть форму")}><ArrowLeft size={24} aria-hidden="true" /></button>
    <Image className="customer-login__logo" src="/brand/wordmark-v3.webp" width={152} height={54} alt="Dushanbe Fresh" priority />
    <span className="customer-login__balance" aria-hidden="true" />
  </>;
  return <CustomerDialog title={t(title)} className={`customer-login customer-login--${step}`} busy={busy} onClose={onClose} headerContent={header}>
    {!available ? <div className="customer-form"><p role="status">{t(requiredForCheckout ? "Вход по SMS пока недоступен. Пожалуйста, попробуйте позже." : "Вход по SMS пока недоступен. Можно оформить заказ без входа.")}</p>
      <button type="button" className="primary-action" onClick={onClose}>{t("Продолжить покупки")}</button></div> :
    <form onSubmit={event => void submit(event)} className="customer-login__form" aria-busy={busy}>
      <div className="customer-login__intro" key={step}><h1>{t(title)}</h1>
        {step === "phone" ? <p>{t("Чтобы войти или зарегистрироваться")}</p> : step === "code" ? <p>{t("Отправили SMS на номер")}<br /><button className="customer-login__phone-link" type="button" onClick={back} disabled={busy}>{displayPhone}</button></p> : null}
      </div>
      {step === "phone" ? <>
        <label className="sr-only" htmlFor="customer-login-phone">{t("Телефон")}</label>
        <div className="customer-login__phone-field">
          <span role="img" aria-label={t("Таджикистан")} className="customer-login__flag">🇹🇯</span><span className="customer-login__prefix">+992</span>
          <input ref={phoneInput} id="customer-login-phone" type="tel" autoComplete="tel-national" inputMode="tel" autoFocus required
            disabled={busy} maxLength={24} placeholder="00 000 00 00" value={formatNationalPhone(phone)}
            onChange={event => { setPhone(nationalPhone(event.target.value)); setError(""); }} />
          <button type="button" className="customer-login__clear" title={t("Очистить номер")} aria-label={t("Очистить номер")} disabled={busy || !phone} onClick={() => { setPhone(""); phoneInput.current?.focus(); }}><X size={20} aria-hidden="true" /></button>
        </div>
        <button className="primary-action" disabled={busy || phone.length !== 9 || (sentPhone.current === phone && remaining > 0)} type="submit">{t(busy ? "Подождите..." : "Продолжить")}</button>
      </> : step === "code" ? <>
        <div className="customer-login__otp">
          <label className="sr-only" htmlFor="customer-login-code">{t("Код из SMS")}</label>
          <div className="customer-login__cells" aria-hidden="true">{Array.from({ length: CUSTOMER_OTP_LENGTH }, (_, index) => <span key={index} data-filled={!!code[index]} data-active={!busy && code.length === index}>{code[index] || ""}</span>)}</div>
          <input ref={codeInput} id="customer-login-code" type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus
            pattern="[0-9]{6}" maxLength={CUSTOMER_OTP_LENGTH} value={code} disabled={busy} aria-invalid={!!error} aria-describedby={error ? "customer-login-error" : undefined}
            onPaste={event => { event.preventDefault(); const value = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, CUSTOMER_OTP_LENGTH); attempted.current = ""; setCode(value); setError(""); if (value.length === CUSTOMER_OTP_LENGTH) void verify(value); }}
            onChange={event => { const value = event.target.value.replace(/\D/g, "").slice(0, CUSTOMER_OTP_LENGTH); if (value.length < CUSTOMER_OTP_LENGTH) attempted.current = ""; setCode(value); setError(""); }} />
        </div>
        <span className="customer-login__verification" role="status">{busy ? t("Проверяем код...") : ""}</span>
        <button className="customer-login__resend" type="button" disabled={busy || remaining > 0} onClick={() => void send()}>{t("Отправить код повторно")}{remaining > 0 ? ` ${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}` : ""}</button>
      </> : <>
        <label className="field">{t("Имя")}<input ref={nameInput} autoFocus autoComplete="given-name" required disabled={busy} maxLength={50} value={firstName} onChange={event => setFirstName(event.target.value)} /></label>
        <label className="field">{t("Фамилия")}<input autoComplete="family-name" required disabled={busy} maxLength={50} value={lastName} onChange={event => setLastName(event.target.value)} /></label>
        <button className="primary-action" disabled={busy || !firstName.trim() || !lastName.trim()} type="submit">{t(busy ? "Подождите..." : "Продолжить")}</button>
      </>}
      <div className="customer-login__error">{error ? <p id="customer-login-error" className="checkout-error" role="alert">{t(error)}</p> : null}</div>
    </form>}
  </CustomerDialog>;
}
