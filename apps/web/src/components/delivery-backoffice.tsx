"use client";

import Link from "next/link";
import { useState } from "react";
import { codLabels, riskLabels, issueReasonLabels, issueStatusLabels, responsibilityLabels, reviewLabels, verificationLabels, type DeliveryIssueDto, type DeliveryFinanceDto } from "@dushanbe-fresh/shared";
import { AdminNotice, useAdminResource } from "./admin-operations-common";
import { adminRequest, dateTime, orderLabels } from "@/lib/operations";
import { decimalLabel } from "@/lib/format";

type QueueIssue = DeliveryIssueDto & { orderNumber: string; customerId: string | null; courierId: string | null; courierName: string | null; address: { recipientName: string; phone: string }; expected: string; collected: string; variance: string };
export function DeliveryProblems() {
  const resource = useAdminResource<QueueIssue[]>("delivery-issues", 10000);
  const [all, setAll] = useState(false); const [selected, setSelected] = useState<string | null>(null);
  return <><h1>Проблемы доставки</h1><div className="operations-tabs" role="tablist" aria-label="Проблемы"><button role="tab" aria-selected={!all} onClick={() => setAll(false)}>Требует внимания</button><button role="tab" aria-selected={all} onClick={() => setAll(true)}>Все обращения</button></div>
    <AdminNotice error={resource.error} busy={resource.busy} />
    <div className="operations-list">{resource.data?.filter(issue => all || ["open", "awaiting_admin"].includes(issue.status)).map(issue => <article key={issue.id} className="operation-item">
      <h2><Link href={`/admin/orders/${issue.orderId}`}>{issue.orderNumber}</Link></h2>
      <p>{issueReasonLabels[issue.reason]} · {issueStatusLabels[issue.status]}</p>
      <p>Курьер: {issue.courierName ?? "Не назначен"}</p>
      {issue.customerVerification === "customer_disputed" ? <p className="notice" role="status">Приоритетный разбор: клиент оспаривает сообщение курьера</p> : null}
      <p>{issue.customerId ? <Link href={`/admin/customers/${issue.customerId}`}>{issue.address.recipientName}</Link> : issue.address.recipientName} · <a href={`tel:${issue.address.phone}`}>{issue.address.phone}</a></p>
      <p>Ответственность: {responsibilityLabels[issue.responsibility]} · {reviewLabels[issue.reviewStatus]}</p><p>Ответ клиента: {verificationLabels[issue.customerVerification]}</p>
      <dl className="operations-info"><div><dt>Ожидалось</dt><dd>{decimalLabel(issue.expected)} сомони</dd></div><div><dt>Заявлено полученным</dt><dd>{decimalLabel(issue.collected)} сомони</dd></div><div><dt>Расхождение</dt><dd>{decimalLabel(issue.variance)} сомони</dd></div></dl>
      <p>{issue.note}</p><button className="secondary-link" aria-expanded={selected === issue.id} onClick={() => setSelected(selected === issue.id ? null : issue.id)}>Разобрать обращение</button>
      {selected === issue.id ? <IssueReview key={issue.id} issue={issue} saved={resource.reload} /> : null}
    </article>)}</div></>;
}
function IssueReview({ issue, saved }: { issue: DeliveryIssueDto; saved: () => void }) {
  const resource = useAdminResource<DeliveryFinanceDto>(`orders/${issue.orderId}/finances`);
  const [form, setForm] = useState({ responsibility: issue.responsibility, reviewStatus: issue.reviewStatus, customerVerification: issue.customerVerification, note: "" });
  return <form className="operations-edit-grid" onSubmit={event => { event.preventDefault(); void resource.run(async () => { await adminRequest(`delivery-issues/${issue.id}`, "PATCH", { ...form, version: resource.data?.version, requestId: crypto.randomUUID() }); saved(); }); }}>
    <AdminNotice error={resource.error} busy={resource.busy} />
    <label className="field">Ответственность<select value={form.responsibility} onChange={event => setForm({ ...form, responsibility: event.target.value as typeof form.responsibility })}>{Object.entries(responsibilityLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
    <label className="field">Результат проверки<select value={form.reviewStatus} onChange={event => setForm({ ...form, reviewStatus: event.target.value as typeof form.reviewStatus })}>{Object.entries(reviewLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
    <label className="field">Проверка у клиента<select value={form.customerVerification} onChange={event => setForm({ ...form, customerVerification: event.target.value as typeof form.customerVerification })}>{Object.entries(verificationLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
    <label className="field">Результат звонка / обоснование<textarea required maxLength={500} value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} /></label>
    <button className="primary-action" disabled={resource.busy || !resource.data}>Сохранить проверку</button>
  </form>;
}
type CustomerDto = { id: string; phoneNormalized: string; displayName: string; riskStatus: keyof typeof riskLabels; codPolicy: keyof typeof codLabels; isActive: boolean;
  confirmedCustomerFaultIncidents: number; unpaidIncidents: number; adminNote: string | null; _count: { orders: number } };
type CustomerDetail = CustomerDto & { namesUsed: string[]; completedOrders: number; serviceFaultIncidents: number;
  orders: Array<{ id: string; orderNumber: string; status: keyof typeof orderLabels; totalEstimated: string; issues: DeliveryIssueDto[] }> };
export function Customers() {
  const [search, setSearch] = useState(""); const [query, setQuery] = useState("");
  const resource = useAdminResource<CustomerDto[]>(`customers?search=${encodeURIComponent(query)}`);
  return <><h1>Клиенты</h1><form className="operations-filters" onSubmit={event => { event.preventDefault(); setQuery(search); }}><label className="field">Телефон или имя<input value={search} onChange={event => setSearch(event.target.value)} /></label><button className="primary-action">Найти</button></form><AdminNotice error={resource.error} busy={resource.busy} />
    <div className="operations-list">{resource.data?.map(customer => <article className="operation-item" key={customer.id}><h2><Link href={`/admin/customers/${customer.id}`}>{customer.displayName}</Link></h2><p>{customer.phoneNormalized}</p><p>{codLabels[customer.codPolicy]} · {riskLabels[customer.riskStatus]}</p><p>Заказов: {customer._count.orders} · Подтверждённых случаев: {customer.confirmedCustomerFaultIncidents} · Неоплат: {customer.unpaidIncidents}</p></article>)}</div></>;
}
export function CustomerProfile({ id }: { id: string }) {
  const resource = useAdminResource<CustomerDetail>(`customers/${id}`);
  const data = resource.data;
  return <><Link className="back-link" href="/admin/customers">Все клиенты</Link><AdminNotice error={resource.error} busy={resource.busy} />{data ? <>
    <h1>{data.displayName}</h1><p><a href={`tel:${data.phoneNormalized}`}>{data.phoneNormalized}</a></p><p>Имена в заказах: {data.namesUsed.join(", ")}</p>
    <dl className="operations-info">{[["Всего заказов", data.orders.length], ["Доставлено", data.completedOrders], ["Подтверждена ответственность клиента", data.confirmedCustomerFaultIncidents], ["Подтверждённые неоплаты", data.unpaidIncidents], ["Ответственность сервиса", data.serviceFaultIncidents]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <form className="operations-edit-grid" key={`${data.codPolicy}:${data.riskStatus}:${data.isActive}`} onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void resource.run(() => adminRequest(`customers/${id}`, "PATCH", { codPolicy: form.get("policy"), riskStatus: form.get("risk"), isActive: form.get("active") === "on", adminNote: form.get("note") })); }}>
      <label className="field">Политика оплаты<select name="policy" defaultValue={data.codPolicy}>{Object.entries(codLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="field">Контроль<select name="risk" defaultValue={data.riskStatus}>{Object.entries(riskLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="staff-checkbox"><input type="checkbox" name="active" defaultChecked={data.isActive} />Обычная обработка профиля</label>
      <label className="field">Примечание администратора<textarea name="note" required maxLength={500} defaultValue={data.adminNote ?? ""} /></label><button className="primary-action" disabled={resource.busy}>Сохранить политику</button>
    </form><h2>История заказов и обращений</h2>{data.orders.map(order => <article key={order.id} className="operation-item"><h3><Link href={`/admin/orders/${order.id}`}>{order.orderNumber}</Link></h3><p>{orderLabels[order.status]} · {decimalLabel(order.totalEstimated)} сомони при оформлении</p>{order.issues.map(issue => <p key={issue.id}>{issueReasonLabels[issue.reason]} · {responsibilityLabels[issue.responsibility]} · {reviewLabels[issue.reviewStatus]} · {issue.note}</p>)}</article>)}
  </> : null}</>;
}
export function OrderAudit({ id }: { id: string }) {
  const resource = useAdminResource<Array<{ id: string; action: string; createdAt: string; user: { name: string | null }; details: Record<string, unknown> | null }>>(`orders/${id}/audit`, 10000);
  const labels: Record<string, string> = { "delivery.issue_created": "Обращение при доставке", "delivery.issue_reviewed": "Проверка обращения", "cash.collection": "Приём наличных", "cash.refund": "Возврат наличных", "delivery.closed": "Передача завершена", "finance.admin_adjustment": "Корректировка начисления", "cash.admin_correction": "Исправление кассы", "delivery.rescheduled": "Перенос доставки", "order.packed": "Заказ упакован", "order.confirmed": "Заказ подтверждён", "order.cancelled": "Заказ отменён", "order.delivered": "Заказ доставлен", "order.paid": "Оплата отмечена" };
  return <details><summary>Журнал заказа</summary><AdminNotice error={resource.error} busy={resource.busy} />{resource.data?.map(row => <div key={row.id}>
    <p>{dateTime(row.createdAt)} · {row.user.name ?? "Сотрудник"} · {labels[row.action] ?? "Операционное действие"}{typeof row.details?.note === "string" ? ` · ${row.details.note}` : ""}</p>
    {typeof row.details?.payableBefore === "string" && typeof row.details.payableAfter === "string" ? <p>Стоимость: {decimalLabel(row.details.payableBefore)} → {decimalLabel(row.details.payableAfter)} сомони</p> : null}
    {typeof row.details?.cashBefore === "string" && typeof row.details.cashAfter === "string" ? <p>Заявленные наличные: {decimalLabel(row.details.cashBefore)} → {decimalLabel(row.details.cashAfter)} сомони</p> : null}
  </div>)}</details>;
}
