"use client";

import { slotUnavailableLabels } from "@dushanbe-fresh/shared";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { CheckoutInput, CheckoutQuote, CreateOrderInput, DeliverySlotDto, SubstitutionPolicy } from "@dushanbe-fresh/shared";
import { useCart } from "@/cart/cart-context";
import { CheckoutError, finishCheckout, getDeliverySlots, slotLabel, validateCheckout } from "@/lib/checkout";
import { decimalLabel, priceLabel, quantityLabel } from "@/lib/format";
import { CheckoutSkeleton, DeliverySlotsSkeleton, SummarySkeleton } from "./loading-state";

export function CheckoutContent() {
  const { state, hydrated, clearCart, removeItem } = useCart();
  const router = useRouter();
  const [slots, setSlots] = useState<DeliverySlotDto[]>([]);
  const [slotsError, setSlotsError] = useState("");
  const [slotsPending, setSlotsPending] = useState(true);
  const [deliverySlotId, setDeliverySlotId] = useState("");
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quotedInput, setQuotedInput] = useState("");
  const [pending, setPending] = useState(false);
  const [sending, setSending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const sendingRef = useRef(false);
  const lastRequest = useRef<{ body: string; requestId: string } | null>(null);
  const [contact, setContact] = useState({ name: "", phone: "" });
  const [address, setAddress] = useState({ street: "", building: "", apartment: "", entrance: "", floor: "", instructions: "" });
  const [policy, setPolicy] = useState<SubstitutionPolicy>("contact_me");
  const inputKey = JSON.stringify({
    items: state.items.map(item => ({ productId: item.productId, quantity: item.quantity,
      qualityOptionId: item.qualityOptionId ?? null, observedPrice: item.sellingPrice })), deliverySlotId
  } satisfies CheckoutInput);

  async function loadSlots() {
    setSlotsPending(true);
    setSlotsError("");
    try { setSlots(await getDeliverySlots()); }
    catch { setSlotsError("Не удалось загрузить время доставки."); }
    finally { setSlotsPending(false); }
  }

  useEffect(() => { void loadSlots(); }, []);
  useEffect(() => {
    const input = JSON.parse(inputKey) as CheckoutInput;
    if (!hydrated || !input.items.length || !input.deliverySlotId) return;
    let cancelled = false;
    setPending(true);
    setAccepted(false);
    setError("");
    void validateCheckout(input).then(result => {
      if (!cancelled) { setQuote(result); setQuotedInput(inputKey); }
    }).catch(error => {
      if (!cancelled) { setQuotedInput(""); setError(error instanceof CheckoutError ? error.message : "Не удалось проверить заказ. Попробуйте ещё раз."); }
    }).finally(() => { if (!cancelled) setPending(false); });
    return () => { cancelled = true; };
  }, [hydrated, inputKey, retry]);

  const currentQuote = quotedInput === inputKey ? quote : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sendingRef.current || pending || !currentQuote?.valid || !accepted) return;
    sendingRef.current = true;
    setSending(true);
    setError("");
    const body = { ...JSON.parse(inputKey) as CheckoutInput, ...contact, address,
      substitutionPolicy: policy, reviewToken: currentQuote.reviewToken };
    const serialized = JSON.stringify(body);
    if (lastRequest.current?.body !== serialized) {
      lastRequest.current = { body: serialized, requestId: crypto.randomUUID() };
    }
    const input: CreateOrderInput = { ...body, requestId: lastRequest.current.requestId };
    try {
      const receipt = await finishCheckout(input, clearCart);
      setCompleted(true);
      router.replace(`/orders/${receipt.orderNumber}/success`);
    } catch (error) {
      if (error instanceof CheckoutError) {
        setError(error.message);
        if (error.quote) {
          setQuote(error.quote); setQuotedInput(inputKey); setAccepted(false);
          void loadSlots();
        }
      } else setError("Не удалось получить подтверждение. Повторите отправку: второй заказ не создастся.");
    } finally { sendingRef.current = false; setSending(false); }
  }

  const heading = <>
    <Link className="back-link" href="/cart">Вернуться в корзину</Link>
    <header className="page-heading"><h1>Оформление заказа</h1><p>Свежие продукты с доставкой по Душанбе</p></header>
  </>;
  if (!hydrated) return <>{heading}<CheckoutSkeleton /></>;
  if (completed) return <>{heading}<p role="status">Заказ оформлен. Открываем подтверждение...</p></>;
  if (!state.items.length) return <div className="empty-cart"><h1>Корзина пока пустая</h1><p>Добавьте свежие продукты из каталога.</p><Link className="primary-link" href="/catalog">Перейти в каталог</Link></div>;

  return <>
    {heading}
    <form onSubmit={submit} className="checkout-layout">
      <fieldset className="checkout-fields" disabled={sending}>
        <section className="checkout-section">
          <h2>Контактные данные</h2>
          <div className="checkout-input-grid">
            <label className="field">Имя<input autoComplete="name" required maxLength={100} value={contact.name} onChange={e => setContact({ ...contact, name: e.target.value })} /></label>
            <label className="field">Телефон<input type="tel" autoComplete="tel" required maxLength={32} placeholder="+992 900 00 00 00" value={contact.phone} onChange={e => setContact({ ...contact, phone: e.target.value })} /></label>
          </div>
        </section>
        <section className="checkout-section">
          <h2>Адрес доставки</h2>
          <div className="checkout-input-grid">
            <label className="field">Улица<input autoComplete="address-line1" required maxLength={150} value={address.street} onChange={e => setAddress({ ...address, street: e.target.value })} /></label>
            <label className="field">Дом<input autoComplete="address-line2" required maxLength={30} value={address.building} onChange={e => setAddress({ ...address, building: e.target.value })} /></label>
            {([['apartment', 'Квартира'], ['entrance', 'Подъезд'], ['floor', 'Этаж']] as const).map(([key, label]) =>
              <label className="field" key={key}>{label}<input maxLength={30} value={address[key]} onChange={e => setAddress({ ...address, [key]: e.target.value })} /></label>)}
          </div>
          <label className="field">Комментарий курьеру<textarea maxLength={500} rows={3} value={address.instructions} onChange={e => setAddress({ ...address, instructions: e.target.value })} /></label>
        </section>
        <section className="checkout-section">
          <h2>Окно доставки</h2>
          {slotsPending ? <DeliverySlotsSkeleton /> : null}
          {slotsError ? <p role="alert">{slotsError}</p> : null}
          {!slotsPending && !slotsError && !slots.length ? <p>Пока нет окон доставки. Попробуйте позже.</p> : null}
          {!slotsPending ? <div className="delivery-options">
            {slots.map(slot => <label className={`checkout-option ${deliverySlotId === slot.id ? "is-selected" : ""}`} key={slot.id}>
              <input type="radio" name="delivery-slot" value={slot.id} disabled={!slot.available} checked={deliverySlotId === slot.id} onChange={() => setDeliverySlotId(slot.id)} />
              <span>{slotLabel(slot)}{slot.unavailableReasons.map(reason => <small key={reason}>{slotUnavailableLabels[reason]}</small>)}</span>
            </label>)}
          </div> : null}
          <button type="button" className="secondary-link" onClick={() => void loadSlots()} disabled={slotsPending}>Обновить время доставки</button>
        </section>
        <fieldset className="checkout-section substitution-options">
          <legend>Если товара нет</legend>
          {([['replace_similar', 'Заменить похожим товаром'], ['contact_me', 'Связаться со мной'], ['remove_item', 'Убрать товар из заказа']] as const).map(([value, label]) =>
            <label className="checkout-option" key={value}><input type="radio" name="substitution" checked={policy === value} onChange={() => setPolicy(value)} /><span>{label}</span></label>)}
        </fieldset>
      </fieldset>
      <aside className="checkout-summary">
        <h2>Проверка заказа</h2>
        {!deliverySlotId ? <p>Выберите окно доставки, чтобы проверить товары и сумму заказа.</p> : null}
        {pending ? <SummarySkeleton /> : null}
        {currentQuote && !pending ? <>
          <ul className="checkout-lines">
            {currentQuote.items.map((item, index) => <li key={`${item.productId}:${index}`}>
              <div className="summary-row"><strong>{item.name}</strong><span>{decimalLabel(item.estimatedTotal)} сомони</span></div>
              <p>{quantityLabel(item.requestedQuantity, item.unit)}{item.sellingPrice ? ` · ${priceLabel(item.sellingPrice, item.unit)}` : ""}</p>
              {item.qualityOption ? <p>{item.qualityOption.label}</p> : null}
              {item.warnings.map(warning => <p className="notice" key={warning}>{warning}</p>)}
              {item.errors.map(error => <p className="checkout-error" role="alert" key={error}>{error}</p>)}
              {item.errors.length ? <button className="secondary-link" type="button" disabled={sending} onClick={() => removeItem(state.items[index])}>Удалить {item.name}</button> : null}
            </li>)}
          </ul>
          <div className="summary-row"><span>Товары</span><span>{decimalLabel(currentQuote.itemsSubtotal)} сомони</span></div>
          <div className="summary-row"><span>Доставка</span><span>{decimalLabel(currentQuote.deliveryFee)} сомони</span></div>
          {currentQuote.serviceFee !== "0.00" ? <div className="summary-row"><span>Сервисный сбор</span><span>{decimalLabel(currentQuote.serviceFee)} сомони</span></div> : null}
          <div className="summary-row summary-total"><strong>Предварительно</strong><strong>{decimalLabel(currentQuote.totalEstimated)} сомони</strong></div>
          {currentQuote.errors.map(error => <p className="checkout-error" role="alert" key={error}>{error}</p>)}
          {currentQuote.items.some(item => item.isWeighted) ? <p>Итоговая сумма может немного измениться после фактического взвешивания.</p> : null}
          <p>Оплата наличными при получении</p>
        </> : null}
        {error ? <p role="alert" className="checkout-error">{error}</p> : null}
        {deliverySlotId ? <button className="secondary-link" type="button" disabled={sending || pending} onClick={() => setRetry(retry + 1)}>Проверить заказ ещё раз</button> : null}
        <label className="checkout-option"><input type="checkbox" checked={accepted} disabled={!currentQuote?.valid || pending || sending} onChange={e => setAccepted(e.target.checked)} /><span>Я проверил товары, стоимость и время доставки</span></label>
        <button className="primary-action" type="submit" disabled={!currentQuote?.valid || !accepted || pending || sending}>{sending ? "Оформляем заказ..." : "Подтвердить заказ"}</button>
      </aside>
    </form>
  </>;
}
