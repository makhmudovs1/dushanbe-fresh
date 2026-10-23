"use client";
import { useI18n } from "@/i18n/provider";


import { slotUnavailableLabels } from "@dushanbe-fresh/shared";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { AddressInput, CheckoutInput, CheckoutQuote, CreateOrderInput, DeliverySlotDto, SavedAddress, SubstitutionPolicy } from "@dushanbe-fresh/shared";
import { useCustomer } from "@/customer/customer-context";
import { useDeliveryAddress } from "@/customer/delivery-address-context";
import { fetchSavedDeliveryAddresses, hasAddressDraft, parseDeliveryAddress, prepareDeliveryAddressStorage, resolveDeliveryAddress } from "@/lib/delivery-address";
import { CustomerError, customerRequest } from "@/lib/customer";
import { CHECKOUT_DRAFT_KEY, loadCheckoutDraft, saveCheckoutDraft } from "@/lib/checkout-draft";
import { AddressFields, emptyAddress } from "./address-fields";
import { useCart } from "@/cart/cart-context";
import { hasLegacyCartItems } from "@/cart/cart";
import { LegacyCartNotice } from "./legacy-cart-notice";
import { CheckoutError, finishCheckout, getDeliverySlots, validateCheckout } from "@/lib/checkout";
import { decimalLabel } from "@/lib/format";
import { CheckoutSkeleton, DeliverySlotsSkeleton, SummarySkeleton } from "./loading-state";
const noSavedAddresses: SavedAddress[] = [];

export function CheckoutContent() {
  const { t, name, label, priceLabel, quantityLabel, slotLabel } = useI18n();
  const { state, hydrated, clearCart, removeItem } = useCart();
  const legacy = hasLegacyCartItems(state);
  const router = useRouter();
  const customer = useCustomer();
  const customerId = customer.user?.id;
  const deliveryAddress = useDeliveryAddress();
  const hasDeliveryProvider = !!deliveryAddress;
  const [accountAddresses, setAccountAddresses] = useState<{ owner: string; values: SavedAddress[] } | null>(null);
  const savedAddresses = deliveryAddress?.savedAddresses ?? (accountAddresses && accountAddresses.owner === customerId ? accountAddresses.values : noSavedAddresses);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [saveAddress, setSaveAddress] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const appliedAddressRevision = useRef(deliveryAddress?.selection?.revision ?? 0);
  const [addressOwner, setAddressOwner] = useState<string | null>(customerId ?? null);
  const prompted = useRef(false);
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
  const [address, setAddress] = useState<AddressInput>(emptyAddress);
  const currentAddress = addressOwner && addressOwner !== customerId ? emptyAddress : address;
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
    if (customer.loading || draftReady) return;
    try {
      prepareDeliveryAddressStorage(window.sessionStorage, customerId ?? null);
      const draft = loadCheckoutDraft(window.sessionStorage);
      if (draft) { setContact(draft.contact); setAddress(parseDeliveryAddress(draft.address, false) ?? emptyAddress); setDeliverySlotId(draft.deliverySlotId); setPolicy(draft.policy); }
    } catch { /* Checkout remains usable when session storage is blocked. */ }
    setAddressOwner(customerId ?? null);
    setDraftReady(true);
  }, [customer.loading, customerId, draftReady]);
  useEffect(() => {
    if (customer.loading || !draftReady || addressOwner === (customerId ?? null)) return;
    if (addressOwner) { setAddress(emptyAddress); setSelectedAddress(""); setSaveAddress(false); }
    setAddressOwner(customerId ?? null);
  }, [customer.loading, customerId, addressOwner, draftReady]);
  useEffect(() => {
    if (draftReady && !completed && addressOwner === (customerId ?? null)) {
      try { saveCheckoutDraft(window.sessionStorage, { contact, address: currentAddress, deliverySlotId, policy }); } catch { /* Storage is optional. */ }
    }
  }, [draftReady, completed, contact, currentAddress, deliverySlotId, policy, addressOwner, customerId]);
  const globalSelection = deliveryAddress?.selection;
  useEffect(() => {
    if (!draftReady || !globalSelection || sending) return;
    const explicit = globalSelection.explicit && globalSelection.revision !== appliedAddressRevision.current;
    appliedAddressRevision.current = globalSelection.revision;
    setAddress(current => resolveDeliveryAddress(current, globalSelection.address, explicit));
    if (explicit) setSelectedAddress("");
  }, [draftReady, globalSelection, sending]);
  const customerPhone = customer.user?.phone;
  const customerName = customer.user?.name;
  useEffect(() => {
    if (hydrated && state.items.length && draftReady && !customer.loading && customer.status.requiredForCheckout && !customer.user && !prompted.current) {
      prompted.current = true; customer.login();
    }
  }, [hydrated, state.items.length, draftReady, customer]);
  useEffect(() => {
    if (!draftReady || !customerId) { if (!customerId) { setAccountAddresses(null); setSelectedAddress(""); } return; }
    setContact(current => ({ name: current.name || customerName || "", phone: customerPhone! }));
    if (hasDeliveryProvider) return;
    const controller = new AbortController();
    void fetchSavedDeliveryAddresses(controller.signal).then(values => {
      if (!controller.signal.aborted) setAccountAddresses({ owner: customerId, values });
    }).catch(() => { if (!controller.signal.aborted) setAccountAddresses(null); });
    return () => controller.abort();
  }, [draftReady, customerId, customerPhone, customerName, hasDeliveryProvider]);
  useEffect(() => {
    if (!draftReady) return;
    const defaultAddress = savedAddresses.find(address => address.isDefault);
    if (defaultAddress) setAddress(current => {
      if (hasAddressDraft(current)) return current;
      setSelectedAddress(defaultAddress.id);
      return parseDeliveryAddress(defaultAddress)!;
    });
  }, [draftReady, savedAddresses]);
  useEffect(() => {
    const input = JSON.parse(inputKey) as CheckoutInput;
    if (!hydrated || legacy || !input.items.length || !input.deliverySlotId) return;
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
  }, [hydrated, inputKey, retry, legacy]);

  const currentQuote = quotedInput === inputKey ? quote : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (legacy || sendingRef.current || pending || !currentQuote?.valid || !accepted) return;
    if (customer.loading) return;
    if (customer.status.requiredForCheckout && !customer.user) { customer.login(); return; }
    sendingRef.current = true;
    setSending(true);
    setError("");
    const body = { ...JSON.parse(inputKey) as CheckoutInput, ...contact, address: currentAddress,
      substitutionPolicy: policy, reviewToken: currentQuote.reviewToken };
    const serialized = JSON.stringify(body);
    if (lastRequest.current?.body !== serialized) {
      lastRequest.current = { body: serialized, requestId: crypto.randomUUID() };
    }
    const input: CreateOrderInput = { ...body, requestId: lastRequest.current.requestId };
    try {
      // Save first; an address-service failure must not leave an ambiguously created order.
      if (saveAddress && customer.user) {
        await customerRequest("customer/addresses", "POST", { ...currentAddress, label: "home", isDefault: !savedAddresses.length });
        setSaveAddress(false);
      }
      const receipt = await finishCheckout(input, clearCart);
      if (customer.user) void customer.refresh();
      try { window.sessionStorage.removeItem(CHECKOUT_DRAFT_KEY); } catch { /* Storage is optional. */ }
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
      if (error instanceof CustomerError) setError(error.message);
      if ((error instanceof CustomerError || error instanceof CheckoutError) && error.status === 401) {
        await customer.refresh(); customer.login();
      }
    } finally { sendingRef.current = false; setSending(false); }
  }

  const heading = <>
    <Link className="back-link" href="/cart">{t("Вернуться в корзину")}</Link>
    <header className="page-heading"><h1>{t("Оформление заказа")}</h1><p>{t("Свежие продукты с доставкой по Душанбе")}</p></header>
  </>;
  if (!hydrated) return <>{heading}<CheckoutSkeleton /></>;
  if (completed) return <>{heading}<p role="status">{t("Заказ оформлен. Открываем подтверждение...")}</p></>;
  if (legacy) return <>{heading}<LegacyCartNotice checkout /></>;
  if (!state.items.length) return <div className="empty-cart"><h1>{t("Корзина пока пустая")}</h1><p>{t("Добавьте свежие продукты из каталога.")}</p><Link className="primary-link" href="/catalog">{t("Перейти в каталог")}</Link></div>;

  return <>
    {heading}
    <form onSubmit={submit} className="checkout-layout">
      <fieldset className="checkout-fields" disabled={sending}>
        <section className="checkout-section">
          <h2>{t("Контактные данные")}</h2>
          <div className="checkout-input-grid">
            <label className="field">{t("Имя")}<input autoComplete="name" required maxLength={100} value={contact.name} onChange={e => setContact({ ...contact, name: e.target.value })} /></label>
            <label className="field">{t(customer.user ? "Подтверждённый телефон" : "Телефон")}<input type="tel" autoComplete="tel" required readOnly={!!customer.user} maxLength={32} placeholder="+992 900 00 00 00" value={contact.phone} onChange={e => setContact({ ...contact, phone: e.target.value })} /></label>
          </div>
          {customer.status.enabled && !customer.user ? <button type="button" className="secondary-link" onClick={customer.login}>{t("Подтвердить телефон и использовать сохранённые адреса")}</button> : null}
        </section>
        <section className="checkout-section">
          <h2>{t("Адрес доставки")}</h2>
          {deliveryAddress ? <button type="button" className="secondary-link" disabled={!deliveryAddress.ready} onClick={() => deliveryAddress.openAddress(currentAddress)}>{t("Выбрать адрес доставки")}</button> : null}
          {savedAddresses.length ? <label className="field">{t("Сохранённый адрес")}<select value={selectedAddress} onChange={event => {
            setSelectedAddress(event.target.value); const saved = savedAddresses.find(address => address.id === event.target.value); setAddress(parseDeliveryAddress(saved) ?? emptyAddress);
          }}><option value="">{t("Новый адрес")}</option>{savedAddresses.map(address => <option key={address.id} value={address.id}>{address.street}, {address.building}</option>)}</select></label> : null}
          <AddressFields value={currentAddress} onChange={value => { setSelectedAddress(""); setAddress(value); }} />
          {customer.user ? <label className="checkout-option"><input type="checkbox" checked={saveAddress} onChange={event => setSaveAddress(event.target.checked)} />{t("Сохранить адрес в личном кабинете")}</label> : null}
        </section>
        <section className="checkout-section">
          <h2>{t("Окно доставки")}</h2>
          {slotsPending ? <DeliverySlotsSkeleton /> : null}
          {slotsError ? <p role="alert">{t(slotsError)}</p> : null}
          {!slotsPending && !slotsError && !slots.length ? <p>{t("Пока нет окон доставки. Попробуйте позже.")}</p> : null}
          {!slotsPending ? <div className="delivery-options">
            {slots.map(slot => <label className={`checkout-option ${deliverySlotId === slot.id ? "is-selected" : ""}`} key={slot.id}>
              <input type="radio" name="delivery-slot" value={slot.id} disabled={!slot.available} checked={deliverySlotId === slot.id} onChange={() => setDeliverySlotId(slot.id)} />
              <span>{slotLabel(slot)}{slot.unavailableReasons.map(reason => <small key={reason}>{t(slotUnavailableLabels[reason])}</small>)}</span>
            </label>)}
          </div> : null}
          <button type="button" className="secondary-link" onClick={() => void loadSlots()} disabled={slotsPending}>{t("Обновить время доставки")}</button>
        </section>
        <fieldset className="checkout-section substitution-options">
          <legend>{t("Если товара нет")}</legend>
          {([['replace_similar', 'Заменить похожим товаром'], ['contact_me', 'Связаться со мной'], ['remove_item', 'Убрать товар из заказа']] as const).map(([value, label]) =>
            <label className="checkout-option" key={value}><input type="radio" name="substitution" checked={policy === value} onChange={() => setPolicy(value)} /><span>{t(label)}</span></label>)}
        </fieldset>
      </fieldset>
      <aside className="checkout-summary">
        <h2>{t("Проверка заказа")}</h2>
        {!deliverySlotId ? <p>{t("Выберите окно доставки, чтобы проверить товары и сумму заказа.")}</p> : null}
        {pending ? <SummarySkeleton /> : null}
        {currentQuote && !pending ? <>
          {currentQuote.deliverySlot ? <p><strong>{t("Окно доставки")}</strong><br />{slotLabel(currentQuote.deliverySlot)}</p> : null}
          <ul className="checkout-lines">
            {currentQuote.items.map((item, index) => <li key={`${item.productId}:${index}`}>
              <div className="summary-row"><strong>{name(item)}</strong><span>{decimalLabel(item.estimatedTotal)}{t(" сомони")}</span></div>
              <p>{quantityLabel(item.requestedQuantity, item.unit)}{item.sellingPrice ? ` · ${priceLabel(item.sellingPrice, item.unit)}` : ""}</p>
              {item.qualityOption ? <p>{label(item.qualityOption)}</p> : null}
              {item.warnings.map(warning => <p className="notice" key={t(warning)}>{t(warning)}</p>)}
              {item.errors.map(error => <p className="checkout-error" role="alert" key={t(error)}>{t(error)}</p>)}
              {item.errors.length ? <button className="secondary-link" type="button" disabled={sending} onClick={() => removeItem(state.items[index])}>{t("Удалить ")}{name(item)}</button> : null}
            </li>)}
          </ul>
          <div className="summary-row"><span>{t("Товары")}</span><span>{decimalLabel(currentQuote.itemsSubtotal)}{t(" сомони")}</span></div>
          <div className="summary-row"><span>{t("Доставка")}</span><span>{decimalLabel(currentQuote.deliveryFee)}{t(" сомони")}</span></div>
          {currentQuote.serviceFee !== "0.00" ? <div className="summary-row"><span>{t("Сервисный сбор")}</span><span>{decimalLabel(currentQuote.serviceFee)}{t(" сомони")}</span></div> : null}
          <div className="summary-row summary-total"><strong>{t("Предварительно")}</strong><strong>{decimalLabel(currentQuote.totalEstimated)}{t(" сомони")}</strong></div>
          {currentQuote.errors.map(error => <p className="checkout-error" role="alert" key={t(error)}>{t(error)}</p>)}
          {currentQuote.items.some(item => item.isWeighted) ? <p>{t("Итоговая сумма может немного измениться после фактического взвешивания.")}</p> : null}
          <p>{t("Оплата наличными при получении")}</p>
        </> : null}
        {error ? <p role="alert" className="checkout-error">{t(error)}</p> : null}
        {deliverySlotId ? <button className="secondary-link" type="button" disabled={sending || pending} onClick={() => setRetry(retry + 1)}>{t("Проверить заказ ещё раз")}</button> : null}
        <label className="checkout-option"><input type="checkbox" checked={accepted} disabled={!currentQuote?.valid || pending || sending} onChange={e => setAccepted(e.target.checked)} /><span>{t("Я проверил товары, стоимость и время доставки")}</span></label>
        <button className="primary-action" type="submit" disabled={!currentQuote?.valid || !accepted || pending || sending || customer.loading}>{t(sending ? "Оформляем заказ..." : customer.status.requiredForCheckout && !customer.user ? "Подтвердить телефон и продолжить" : "Подтвердить заказ")}</button>
      </aside>
    </form>
  </>;
}
