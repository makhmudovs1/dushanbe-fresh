"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { adjustmentLabels, issueReasonLabels, resolutionLabels, outcomeLabels, type DeliveryFinanceDto, type DeliverySlotDto, type IssuePreview } from "@dushanbe-fresh/shared";
import { adminRequest } from "@/lib/operations";
import { decimalLabel, quantityLabel } from "@/lib/format";
import { slotLabel } from "@/lib/checkout";
import { AdminNotice, useAdminResource } from "./admin-operations-common";
import { useStaff } from "./staff-layout";

export function DeliveryFinancePanel({ id, updated = () => {}, expanded = false }: { id: string; updated?: () => void; expanded?: boolean }) {
  const user = useStaff(); const admin = user.roles.includes("admin");
  const resource = useAdminResource<DeliveryFinanceDto>(`orders/${id}/finances`, 10000);
  const [details, setDetails] = useState(expanded);
  const [wizard, setWizard] = useState(false); const [payment, setPayment] = useState(false);
  const [mode, setMode] = useState("unpaid"); const [amount, setAmount] = useState(""); const [note, setNote] = useState("");
  const pending = useRef<{ signature: string; payload: Record<string, unknown> } | null>(null);
  const data = resource.data;
  async function action(path: string, body: Record<string, unknown> = {}) {
    const signature = JSON.stringify({ path, body, note });
    if (pending.current?.signature !== signature) pending.current = { signature, payload: { ...body, note: body.note ?? note, version: body.version ?? data?.version, requestId: crypto.randomUUID() } };
    const payload = pending.current.payload;
    await resource.run(async () => { await adminRequest(`orders/${id}/${path}`, "POST", payload); pending.current = null; setWizard(false); setPayment(false); updated(); });
  }
  if (!data) return <AdminNotice error={resource.error} busy={resource.busy} />;
  return <section className="delivery-finance" aria-label="Расчёты по доставке">
    <AdminNotice error={resource.error} busy={resource.busy} />
    {resource.error ? <button className="secondary-link" disabled={resource.busy} onClick={() => { pending.current = null; setWizard(false); setPayment(false); resource.reload(); }}>Обновить расчёт и проверить заново</button> : null}
    <p><strong>К получению: {decimalLabel(data.amountToCollect)} сомони</strong></p>
    {admin && data.customerId ? <Link href={`/admin/customers/${data.customerId}`}>История клиента</Link> : null}
    {data.outcome !== "full" ? <p>{outcomeLabels[data.outcome]}</p> : null}
    {admin ? <label className="field">Причина действия администратора<textarea maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></label> : null}
    {data.canAct ? <div className="operations-actions">
      {!data.collectionReported ? <button className="primary-action" disabled={resource.busy} onClick={() => void action("collection", { mode: "full" })}>Доставлен и получено {decimalLabel(data.amountToCollect)} сомони</button> : <button className="primary-action" disabled={resource.busy || data.refundDue !== "0.00"} onClick={() => void action("close-delivery")}>Завершить передачу заказа</button>}
      <button className="secondary-link" disabled={resource.busy} onClick={() => { setWizard(!wizard); setPayment(false); }}>Проблема при доставке</button>
      {!data.collectionReported ? <button className="secondary-link" disabled={resource.busy} onClick={() => { setPayment(!payment); setWizard(false); }}>Клиент не оплатил / оплатил частично</button> : null}
      {data.refundDue !== "0.00" ? <button className="primary-action" disabled={resource.busy} onClick={() => void action("refund")}>Вернул {decimalLabel(data.refundDue)} сомони</button> : null}
    </div> : <p>{data.closedAt ? "Передача завершена. Новые обращения рассматривает администратор." : "Действия доступны после передачи заказа курьеру."}</p>}
    {admin && !data.canAct ? <button className="secondary-link" onClick={() => setWizard(!wizard)}>Новое обращение после доставки</button> : null}
    {payment ? <form className="operations-edit-grid" onSubmit={event => { event.preventDefault(); void action("collection", { mode, ...(mode === "partial" ? { amount } : {}), note }); }}>
      <label className="field">Оплата<select value={mode} onChange={event => setMode(event.target.value)}><option value="unpaid">Клиент не оплатил</option><option value="partial">Оплачено частично</option></select></label>
      {mode === "partial" ? <label className="field">Фактически получено, сомони<input required inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value.replace(",", "."))} /></label> : null}
      <label className="field">Причина / примечание<textarea required maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></label>
      <p>Расхождение будет передано администратору. Ответственность клиента ещё не установлена.</p><button className="primary-action" disabled={resource.busy}>Зафиксировать и завершить передачу</button>
    </form> : null}
    {wizard ? <IssueWizard data={data} busy={resource.busy} save={body => action("issues", body)} /> : null}
    <button className="secondary-link" aria-expanded={details} onClick={() => setDetails(!details)}>Расчёт и история</button>
    {details ? <>
      <dl className="operations-info">{[["При оформлении", data.originalCheckoutTotal], ["После упаковки, до корректировок", data.originalPackedTotal], ["Товары", data.goods], ["Сервисный сбор", data.serviceFee], ["Доставка", data.deliveryFee], ["Скидка", data.discountTotal], ["Корректировки", data.adjustmentTotal], ["Текущая стоимость", data.payable], ["Получено за вычетом возвратов", data.collected], ["Осталось получить", data.amountToCollect], ["Нужно вернуть", data.refundDue]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{decimalLabel(value)} сомони</dd></div>)}</dl>
      {data.adjustments.map(row => <p key={row.id}>{adjustmentLabels[row.type]}: {decimalLabel(row.amount)} сомони · {row.reason in issueReasonLabels ? issueReasonLabels[row.reason as keyof typeof issueReasonLabels] : row.reason}</p>)}
      {data.cash.map(row => <p key={row.id}>{row.type === "collection" ? "Получено" : row.type === "cash_refund" ? "Возврат" : "Исправление кассы"}: {decimalLabel(row.amount)} сомони · {row.note}</p>)}
      {data.issues.map(issue => <p key={issue.id}>{issueReasonLabels[issue.reason]} · {issue.note}</p>)}
      {data.replacements.map(replacement => <p key={replacement.id}><Link href={`/admin/orders/${replacement.fulfillmentOrder.id}`}>Замена {replacement.fulfillmentOrder.orderNumber}</Link> · {replacement.prepaid ? "Товар уже оплачен" : "Оплата товара при повторной доставке"}</p>)}
      {data.canAct && !data.collectionReported ? <button className="secondary-link" disabled={resource.busy} onClick={() => void action("collection", { mode: "full", closeDelivery: false })}>Получить {decimalLabel(data.amountToCollect)} сомони, не закрывая передачу</button> : null}
      {admin ? <AdminAdjustments data={data} busy={resource.busy} action={action} /> : null}
    </> : null}
  </section>;
}

function IssueWizard({ data, busy, save }: { data: DeliveryFinanceDto; busy: boolean; save: (body: Record<string, unknown>) => Promise<void> }) {
  const [step, setStep] = useState(1); const [reason, setReason] = useState<keyof typeof issueReasonLabels>("quality_problem");
  const [resolution, setResolution] = useState<keyof typeof resolutionLabels>("accept_rest_remove_items");
  const [quantities, setQuantities] = useState<Record<string, string>>({}); const [note, setNote] = useState(""); const [slot, setSlot] = useState("");
  const [slots, setSlots] = useState<DeliverySlotDto[]>([]); const [preview, setPreview] = useState<IssuePreview | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const [nextAction, setNextAction] = useState("escalate_to_admin"); const [customerAgreed, setCustomerAgreed] = useState(false);
  const eligible = ["quality_problem", "damaged_item", "wrong_item", "missing_item_or_quantity", "customer_changed_mind"].includes(reason);
  const attempt = ["customer_unreachable", "customer_not_home", "wrong_address"].includes(reason);
  const selectedResolution = eligible ? resolution : "escalate_to_admin";
  const financial = ["accept_rest_remove_items", "full_refusal", "replacement_later"].includes(selectedResolution);
  const body = { reason, resolution: selectedResolution, note, deliverySlotId: slot, nextAction, customerAgreed: reason === "price_dispute" && customerAgreed,
    items: Object.entries(quantities).map(([orderItemId, quantityAffected]) => ({ orderItemId, quantityAffected })) };
  async function loadSlots() {
    try { const response = await fetch("/api/v1/delivery-slots", { cache: "no-store" }); if (!response.ok) throw new Error("Не удалось загрузить окна."); setSlots(await response.json()); }
    catch (error) { setError(error instanceof Error ? error.message : "Ошибка загрузки."); }
  }
  return <form className="issue-wizard" aria-label="Проблема при доставке" onSubmit={event => { event.preventDefault(); setError("");
    if (step < 3) { setStep(step + 1); return; }
    if (step === 3) { setLoading(true); void (financial ? adminRequest<IssuePreview>(`orders/${data.id}/issues/preview`, "POST", { ...body, version: data.version }).then(setPreview) : Promise.resolve()).then(() => setStep(4)).catch(error => setError(error.message)).finally(() => setLoading(false)); return; }
    void save({ ...body, ...(preview ? { version: preview.version } : {}) });
  }}>
    <h3>{step}. {step === 1 ? "Что случилось?" : step === 2 ? "Какие товары затронуты?" : step === 3 ? "Решение" : "Подтверждение"}</h3>
    {error ? <p role="alert" className="notice">{error}</p> : null}
    {step === 1 ? <><label className="field">Причина<select value={reason} onChange={event => { setReason(event.target.value as typeof reason); setPreview(null); }}>{Object.entries(issueReasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field">Примечание<textarea required maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></label></> : null}
    {step === 2 ? eligible ? <div className="issue-items">{data.items.filter(item => item.remaining !== "0").map(item => <div key={item.id}><label className="staff-checkbox"><input type="checkbox" checked={item.id in quantities} onChange={event => setQuantities(previous => { const next = { ...previous }; if (event.target.checked) next[item.id] = item.remaining; else delete next[item.id]; return next; })} />{item.name} · {quantityLabel(item.remaining, item.unit)}</label>{item.id in quantities ? <label className="field">Затронуто: {item.name}<input required inputMode="decimal" value={quantities[item.id]} onChange={event => setQuantities({ ...quantities, [item.id]: event.target.value.replace(",", ".") })} /></label> : null}</div>)}</div> : <p>Проблема касается доставки или расчёта заказа.</p> : null}
    {step === 3 ? <>
      {reason === "price_dispute" ? <><dl className="operations-info">{[["Товары", data.goods], ["Сервисный сбор", data.serviceFee], ["Доставка", data.deliveryFee], ["Корректировки", data.adjustmentTotal], ["К получению", data.amountToCollect]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{decimalLabel(value)} сомони</dd></div>)}</dl><label className="field">После объяснения расчёта<select value={customerAgreed ? "agreed" : "admin"} onChange={event => setCustomerAgreed(event.target.value === "agreed")}><option value="admin">Передать администратору</option><option value="agreed">Клиент согласился</option></select></label></> : null}
      {eligible ? <label className="field">Что хочет клиент?<select value={resolution} onChange={event => { setResolution(event.target.value as typeof resolution); if (event.target.value === "replacement_later") void loadSlots(); }}>
        {Object.entries(resolutionLabels).filter(([value]) => value !== "payment_issue" && !(value === "replacement_later" && reason === "customer_changed_mind")).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label> : <p>Обращение передаётся администратору. Сумма самостоятельно не меняется.</p>}
      {attempt ? <label className="field">Следующая попытка<select value={nextAction} onChange={event => { setNextAction(event.target.value); if (event.target.value === "request_new_slot") void loadSlots(); }}><option value="escalate_to_admin">Передать администратору</option><option value="retry_same_wave">Попробовать позже в этой волне</option><option value="request_new_slot">Предложить новое окно</option></select></label> : null}
      {(selectedResolution === "replacement_later" || attempt && nextAction === "request_new_slot") ? <label className="field">Окно доставки<select required value={slot} onChange={event => setSlot(event.target.value)}><option value="">Выберите окно</option>{slots.filter(slot => slot.available).map(slot => <option key={slot.id} value={slot.id}>{slotLabel(slot)}</option>)}</select></label> : null}
    </> : null}
    {step === 4 ? <>
      <p>{issueReasonLabels[reason]} · {reason === "price_dispute" && customerAgreed ? "Клиент согласился с расчётом" : resolutionLabels[selectedResolution]}</p>
      {preview ? <dl className="operations-info">
        <div><dt>Было к оплате</dt><dd>{decimalLabel(preview.before)} сомони</dd></div>
        {preview.adjustments.map(row => <div key={row.type}><dt>{adjustmentLabels[row.type]}</dt><dd>{decimalLabel(row.amount)} сомони</dd></div>)}
        <div><dt>Новая стоимость</dt><dd>{decimalLabel(preview.after)} сомони</dd></div><div><dt>Возврат наличными</dt><dd>{decimalLabel(preview.refund)} сомони</dd></div>
        {selectedResolution === "replacement_later" ? <div><dt>При повторной доставке</dt><dd>{decimalLabel(preview.replacementDue)} сомони, без новых сборов</dd></div> : null}
      </dl> : <p>{reason === "price_dispute" && customerAgreed ? "Сумма не меняется. Можно продолжить передачу заказа." : "Сумма не меняется. Требуется разбор администратора."}</p>}
      {preview?.requiresAdmin ? <p>Ответственность клиента пока не подтверждена.</p> : null}
      <label className="staff-checkbox"><input type="checkbox" required />{attempt || !financial ? "Обстоятельства записаны верно" : "Результат согласован с клиентом"}</label>
    </> : null}
    <div className="operations-actions">{step > 1 ? <button type="button" className="secondary-link" onClick={() => setStep(step - 1)}>Назад</button> : null}<button className="primary-action" disabled={busy || loading}>{step === 4 ? "Подтвердить решение" : "Далее"}</button></div>
  </form>;
}

function AdminAdjustments({ data, busy, action }: { data: DeliveryFinanceDto; busy: boolean; action: (path: string, body: Record<string, unknown>) => Promise<void> }) {
  const [type, setType] = useState("delivery_fee_waiver"); const [amount, setAmount] = useState(""); const [direction, setDirection] = useState("decrease"); const [courierId, setCourier] = useState("");
  const staff = useAdminResource<Array<{ id: string; name: string; roles: string[] }>>("staff");
  return <details><summary>Корректировка администратора</summary><form className="operations-edit-grid" onSubmit={event => { event.preventDefault(); void action(type === "cash" ? "cash-corrections" : "adjustments", { type, amount, direction, courierId }); }}>
    <label className="field">Действие<select value={type} onChange={event => setType(event.target.value)}><option value="delivery_fee_waiver">Отменить стоимость доставки</option><option value="service_fee_waiver">Отменить сервисный сбор</option><option value="admin_compensation">Компенсация</option><option value="correction">Корректировка начисления</option><option value="cash">Исправить заявленные наличные / возврат после закрытия</option></select></label>
    {["admin_compensation", "correction", "cash"].includes(type) ? <label className="field">Сумма, сомони<input inputMode="decimal" required value={amount} onChange={event => setAmount(event.target.value.replace(",", "."))} /></label> : null}
    {["correction", "cash"].includes(type) ? <label className="field">Направление<select value={direction} onChange={event => setDirection(event.target.value)}><option value="decrease">Уменьшить</option><option value="increase">Увеличить</option></select></label> : null}
    {type === "cash" ? <label className="field">Курьер<select required value={courierId} onChange={event => setCourier(event.target.value)}><option value="">Выберите курьера</option>{staff.data?.filter(user => user.roles.includes("courier")).map(user => <option value={user.id} key={user.id}>{user.name}</option>)}</select></label> : null}
    <p>Исходная стоимость: {decimalLabel(data.originalPackedTotal)} сомони. Запись сохранится в журнале.</p><button className="primary-action" disabled={busy}>Подтвердить корректировку</button>
  </form></details>;
}
