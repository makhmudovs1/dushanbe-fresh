"use client";
import { useState } from "react";
import { shiftLabels, type CashShiftDto } from "@dushanbe-fresh/shared";
import { AdminNotice, useAdminResource } from "./admin-operations-common";
import { adminRequest, dateTime } from "@/lib/operations";
import { decimalLabel } from "@/lib/format";
import { useStaff } from "./staff-layout";

export function CashShifts() {
  const admin = useStaff().roles.includes("admin");
  const resource = useAdminResource<CashShiftDto[]>("cash-shifts", 10000);
  const stats = useAdminResource<Array<{ id: string; name: string; deliveriesCount: number; expectedCash: string; reportedCollected: string; totalVariance: string; unpaidCount: number; partialCount: number }>>(admin ? "cash-statistics" : null);
  const [history, setHistory] = useState(false);
  return <><h1>{admin ? "Касса курьеров" : "Моя касса"}</h1><AdminNotice error={resource.error || stats.error} busy={resource.busy} />
    {admin ? <><h2>Заявления об оплате заказов</h2><div className="operations-list">{stats.data?.map(row => <article className="operation-item" key={row.id}><h3>{row.name}</h3><p>Доставок: {row.deliveriesCount} · Неоплат: {row.unpaidCount} · Частичных оплат: {row.partialCount}</p><p>Ожидалось при приёме: {decimalLabel(row.expectedCash)} · Заявлено: {decimalLabel(row.reportedCollected)} · Расхождение: {decimalLabel(row.totalVariance)} сомони</p></article>)}</div></> : null}
    <div className="operations-tabs" role="tablist" aria-label="Кассовые смены"><button role="tab" aria-selected={!history} onClick={() => setHistory(false)}>Текущие и на сверке</button><button role="tab" aria-selected={history} onClick={() => setHistory(true)}>Все смены</button></div>
    {resource.data?.length === 0 ? <p>Кассовых операций пока нет.</p> : null}
    {resource.data?.filter(shift => history || shift.status !== "reconciled").map(shift => <article className="operation-item" key={shift.id}>
      <h2>{admin ? shift.courierName : "Смена"} · {dateTime(shift.openedAt)}</h2><p>{shiftLabels[shift.status]}</p>
      <dl className="operations-info">{[["Заказов", String(shift.ordersCount)], ["По системе получено", shift.collectionTotal], ["Возвраты", shift.refundTotal], ["Исправления кассы", shift.correctionTotal], ["Должен сдать", shift.expectedCash], ["Заявлено к сдаче", shift.declaredCash ?? "0"], ["Расхождение", shift.variance ?? "0"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{decimalLabel(value)}</dd></div>)}</dl>
      {shift.note ? <p>{shift.note}</p> : null}{shift.reviewNote ? <p>Сверка: {shift.reviewNote}</p> : null}
      {shift.status === "open" ? <form className="operations-edit-grid" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void resource.run(() => adminRequest(`cash-shifts/${shift.id}/submit`, "POST", { declaredCash: String(form.get("amount")).replace(",", "."), note: form.get("note") })); }}>
        <label className="field">Фактически сдаю, сомони<input name="amount" required inputMode="decimal" /></label><label className="field">Причина расхождения / примечание<textarea name="note" required={admin} maxLength={500} /></label><button className="primary-action" disabled={resource.busy}>Завершить смену</button>
      </form> : admin ? <form className="operations-edit-grid" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void resource.run(() => adminRequest(`cash-shifts/${shift.id}/reconcile`, "POST", { status: form.get("status"), note: form.get("note") })); }}>
        <label className="field">Результат<select name="status"><option value="reconciled">Подтвердить сверку</option><option value="discrepancy">Отметить расхождение</option></select></label><label className="field">Примечание проверки<textarea name="note" required maxLength={500} /></label><button className="primary-action" disabled={resource.busy}>Сверить кассу</button>
      </form> : null}
    </article>)}
  </>;
}
