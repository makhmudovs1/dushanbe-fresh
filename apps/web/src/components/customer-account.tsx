"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CustomerOrderSummary, SavedAddress, SavedAddressInput } from "@dushanbe-fresh/shared";
import { Plus, Pencil, Trash2, LogOut } from "lucide-react";
import { useCustomer } from "@/customer/customer-context";
import { CustomerError, customerRequest } from "@/lib/customer";
import { useCart } from "@/cart/cart-context";
import { Product } from "@/lib/api";
import { useI18n } from "@/i18n/provider";
import { orderLabels } from "@/lib/operations";
import { AddressFields, emptyAddress } from "./address-fields";

export function CustomerAccount() {
  const customer = useCustomer();
  const { t, name, locale } = useI18n();
  const cart = useCart();
  const [tab, setTab] = useState<"orders" | "addresses" | "profile">("orders");
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [orders, setOrders] = useState<CustomerOrderSummary[]>([]);
  const [editor, setEditor] = useState<(SavedAddressInput & { id?: string }) | null>(null);
  const [profileName, setProfileName] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [more, setMore] = useState(false);
  const userId = customer.user?.id;
  const owner = useRef(userId);
  owner.current = userId;
  const load = useCallback(async () => {
    const requestedOwner = owner.current;
    if (!requestedOwner) return;
    setLoaded(false);
    try {
      const [a, o] = await Promise.all([customerRequest<SavedAddress[]>("customer/addresses"), customerRequest<CustomerOrderSummary[]>("customer/orders")]);
      if (owner.current !== requestedOwner) return;
      setAddresses(a); setOrders(o); setMore(o.length === 50); setError("");
    } catch (error) { if (owner.current === requestedOwner) setError(error instanceof Error ? error.message : "Не удалось загрузить личный кабинет."); }
    finally { if (owner.current === requestedOwner) setLoaded(true); }
  }, []);
  useEffect(() => { if (userId) void load(); else { setAddresses([]); setOrders([]); setEditor(null); } }, [userId, load]);
  useEffect(() => { setProfileName(customer.user?.name ?? ""); }, [customer.user?.name]);
  async function run(action: () => Promise<void>) {
    if (busy) return; setBusy(true); setError(""); setNotice("");
    try { await action(); }
    catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось сохранить изменения.");
      if (error instanceof CustomerError && error.status === 401) await customer.refresh();
    } finally { setBusy(false); }
  }
  if (customer.loading) return <p role="status">{t("Загрузка...")}</p>;
  if (!customer.user) return <section className="account-empty"><h1>{t("Личный кабинет")}</h1><p>{t(customer.status.enabled ? "Войдите, чтобы видеть свои заказы и адреса." : "Вход по SMS пока недоступен. Можно оформить заказ без входа.")}</p>
    {customer.status.enabled ? <button className="primary-action" onClick={customer.login}>{t("Войти")}</button> : null}<Link href="/catalog" className="secondary-link">{t("Перейти в каталог")}</Link></section>;
  const labels = { home: "Дом", work: "Работа", other: "Другой" };
  return <>
    <header className="account-heading"><h1>{t("Личный кабинет")}</h1><button type="button" className="secondary-link" disabled={busy} onClick={() => void run(customer.logout)}><LogOut size={18} />{t("Выйти")}</button></header>
    <nav className="account-tabs" aria-label={t("Личный кабинет")}>{([['orders', 'Мои заказы'], ['addresses', 'Мои адреса'], ['profile', 'Личные данные']] as const).map(([key, label]) => <button key={key} type="button" aria-current={tab === key ? "page" : undefined} onClick={() => { setTab(key); setError(""); setNotice(""); }}>{t(label)}</button>)}</nav>
    {error ? <p className="checkout-error" role="alert">{t(error)}</p> : null}{notice ? <p className="notice" role="status">{notice}</p> : null}
    {!loaded && tab !== "profile" ? <p role="status">{t("Загрузка...")}</p> : null}
    {tab === "orders" ? <section className="account-section"><h2>{t("Мои заказы")}</h2>
      {loaded && !orders.length ? <p>{t("Пока нет заказов в вашем аккаунте.")}</p> : null}
      <div className="account-order-list">{orders.map(order => <article key={order.id} className="account-order">
        <div><strong>{order.orderNumber}</strong><p>{new Date(order.createdAt).toLocaleDateString(locale === "tg" ? "tg-TJ" : "ru-RU")}</p><p>{t(orderLabels[order.status as keyof typeof orderLabels] ?? order.status)}</p></div>
        <strong>{order.total} {t("сомони")}</strong>
        <div className="account-order-actions"><Link href={`/order/${order.publicTrackingToken}`} className="secondary-link">{t("Подробнее и отслеживание")}</Link>
          <button type="button" className="secondary-link" disabled={busy || !cart.hydrated} onClick={() => void run(async () => {
            const result = await customerRequest<{ items: { product: Product; quantity: string; qualityOptionId: string | null }[]; unavailable: { name: string; nameTj?: string | null }[] }>(`customer/orders/${order.id}/repeat`, "POST");
            cart.repeatProducts(result.items);
            setNotice(`${t("Доступные товары добавлены в корзину по текущим ценам.")}${result.unavailable.length ? ` ${t("Сейчас недоступно:")} ${result.unavailable.map(name).join(", ")}.` : ""}`);
          })}>{t("Повторить заказ")}</button></div>
      </article>)}</div>
      {more ? <button className="secondary-link" disabled={busy} onClick={() => void run(async () => {
        const next = await customerRequest<CustomerOrderSummary[]>(`customer/orders?before=${encodeURIComponent(orders[orders.length - 1].id)}`);
        setMore(next.length === 50);
        setOrders([...orders, ...next.filter(order => !orders.some(old => old.id === order.id))]);
      })}>{t("Показать ещё")}</button> : null}
      {notice ? <Link href="/cart" className="primary-link">{t("Перейти в корзину")}</Link> : null}
      <details className="claim-order"><summary>{t("Добавить прежний заказ по ссылке")}</summary><p>{t("Нужна приватная ссылка на заказ и совпадающий подтверждённый номер.")}</p>
        <form className="customer-form" onSubmit={event => { event.preventDefault(); void run(async () => {
          let value = token.trim(); try { value = new URL(value).pathname.split("/").filter(Boolean).pop() ?? ""; } catch { /* A bare tracking token is also accepted. */ }
          await customerRequest("customer/claim-order", "POST", { token: value }); setToken(""); await load();
        }); }}><label className="field">{t("Приватная ссылка на заказ")}<input value={token} required onChange={event => setToken(event.target.value)} /></label><button disabled={busy} className="primary-action">{t("Добавить заказ")}</button></form>
      </details>
    </section> : null}
    {tab === "addresses" ? <section className="account-section"><h2>{t("Мои адреса")}</h2>
      {addresses.map(address => <article className="account-address" key={address.id}><div><strong>{t(labels[address.label])}{address.isDefault ? ` · ${t("По умолчанию")}` : ""}</strong><p>{address.street}, {address.building}{address.apartment ? `, ${t("Квартира")} ${address.apartment}` : ""}</p><p>{address.instructions}</p></div><div className="address-tools">
        {!address.isDefault ? <button type="button" className="secondary-link" disabled={busy} onClick={() => void run(async () => { setAddresses(await customerRequest<SavedAddress[]>(`customer/addresses/${address.id}`, "PATCH", { ...address, isDefault: true })); })}>{t("Сделать основным")}</button> : null}
        <button className="catalog-icon-action" title={t("Изменить адрес")} aria-label={t("Изменить адрес")} disabled={busy} onClick={() => setEditor(address)}><Pencil size={18} /></button>
        <button className="catalog-icon-action" title={t("Удалить адрес")} aria-label={t("Удалить адрес")} disabled={busy} onClick={() => void run(async () => { setAddresses(await customerRequest<SavedAddress[]>(`customer/addresses/${address.id}`, "DELETE")); })}><Trash2 size={18} /></button>
      </div></article>)}
      {!editor ? <button type="button" className="secondary-link" onClick={() => setEditor({ ...emptyAddress, label: "home", isDefault: !addresses.length })}><Plus size={18} />{t("Добавить адрес")}</button> :
        <form className="customer-form address-editor" onSubmit={event => { event.preventDefault(); void run(async () => {
          setAddresses(await customerRequest<SavedAddress[]>(`customer/addresses${editor.id ? `/${editor.id}` : ""}`, editor.id ? "PATCH" : "POST", editor)); setEditor(null);
        }); }}><h3>{t(editor.id ? "Изменить адрес" : "Добавить адрес")}</h3>
          <label className="field">{t("Название адреса")}<select value={editor.label} onChange={event => setEditor({ ...editor, label: event.target.value as SavedAddressInput["label"] })}>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select></label>
          <AddressFields value={editor} onChange={address => setEditor({ ...editor, ...address })} />
          <label className="checkout-option"><input type="checkbox" checked={editor.isDefault} onChange={event => setEditor({ ...editor, isDefault: event.target.checked })} />{t("По умолчанию")}</label>
          <div className="address-tools"><button className="primary-action" disabled={busy}>{t("Сохранить")}</button><button className="secondary-link" type="button" disabled={busy} onClick={() => setEditor(null)}>{t("Отмена")}</button></div>
        </form>}
    </section> : null}
    {tab === "profile" ? <section className="account-section"><h2>{t("Личные данные")}</h2><form className="customer-form" onSubmit={event => { event.preventDefault(); void run(async () => { await customerRequest("customer/profile", "PATCH", { name: profileName }); await customer.refresh(); setNotice(t("Изменения сохранены.")); }); }}>
      <label className="field">{t("Имя")}<input autoComplete="name" value={profileName} required maxLength={100} onChange={event => setProfileName(event.target.value)} /></label>
      <label className="field">{t("Подтверждённый телефон")}<input readOnly type="tel" value={customer.user.phone} /></label><button className="primary-action" disabled={busy}>{t("Сохранить")}</button>
    </form></section> : null}
  </>;
}
