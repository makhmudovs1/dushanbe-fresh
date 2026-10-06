"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { StaffEmployee, StaffRole } from "@dushanbe-fresh/shared";
import { adminRequest } from "@/lib/operations";
import { roleLabels } from "@/lib/staff-auth";
import { AdminNotice, useAdminResource } from "./admin-operations-common";
import { useStaff } from "./staff-layout";

const blank = { name: "", email: "", password: "", roles: ["picker"] as StaffRole[], status: "active" as "active" | "inactive", confirmAdmin: false };
export function StaffManagement() {
  const resource = useAdminResource<StaffEmployee[]>("staff");
  const currentUser = useStaff();
  const [selected, setSelected] = useState<StaffEmployee | null>(null);
  const [form, setForm] = useState(blank);
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const editor = useRef<HTMLElement>(null);
  const select = (person: StaffEmployee | null, focus = true) => {
    setSelected(person); setForm(person ? { ...blank, name: person.name ?? "", email: person.email, roles: person.roles, status: person.status } : blank);
    setPassword(""); setNotice("");
    if (focus) editor.current?.scrollIntoView({ block: "start" });
  };
  const toggle = (role: StaffRole, checked: boolean) => setForm({ ...form, confirmAdmin: false, roles: checked ? [...form.roles, role] : form.roles.filter(value => value !== role) });
  const isSelf = selected?.id === currentUser.id;
  return <>
    <Link className="back-link" href="/admin/settings">Настройки</Link>
    <header className="page-heading"><h1>Сотрудники</h1></header>
    <div className="staff-management">
      <section aria-label="Список сотрудников">
        <button className="primary-action" disabled={resource.busy} onClick={() => select(null)}>Новый сотрудник</button>
        <div className="staff-list">{resource.data?.map(person => <button className="staff-person" key={person.id} disabled={resource.busy} aria-pressed={selected?.id === person.id} onClick={() => select(person)}>
          <strong>{person.name ?? "Без имени"}</strong><span>{person.email}</span><span>{person.roles.map(role => roleLabels[role]).join(", ")}</span><small>{person.status === "active" ? "Активен" : "Отключён"}</small>
        </button>)}</div>
      </section>
      <section aria-label="Редактирование сотрудника" ref={editor}>
        <h2>{selected ? "Редактировать сотрудника" : "Новый сотрудник"}</h2>
        <AdminNotice error={resource.error} busy={resource.busy} />
        {notice ? <p className="notice" role="status">{notice}</p> : null}
        <form className="admin-form" onSubmit={event => { event.preventDefault(); setNotice(""); void resource.run(async () => {
          const body = selected ? { name: form.name, roles: form.roles, status: form.status, confirmAdmin: form.confirmAdmin } : form;
          await adminRequest(selected ? `staff/${selected.id}` : "staff", selected ? "PATCH" : "POST", body);
          select(null, false); setNotice(selected ? "Сотрудник обновлён." : "Сотрудник создан.");
        }); }}>
          <fieldset className="product-form-fields" disabled={resource.busy}>
            <label>Имя<input required maxLength={120} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
            <label>Электронная почта<input type="email" required readOnly={!!selected} autoCapitalize="none" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
            {!selected ? <label>Пароль<input type="password" autoComplete="new-password" required minLength={12} value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /><small>От 12 символов, не больше 72 байт.</small></label> : null}
            <fieldset className="staff-role-options"><legend>Роли</legend>{(["picker", "courier"] as const).map(role => <label key={role}><input type="checkbox" checked={form.roles.includes(role)} onChange={event => toggle(role, event.target.checked)} />{roleLabels[role]}</label>)}</fieldset>
            <details className="staff-admin-option" open={form.roles.includes("admin") || undefined}><summary>Административный доступ</summary>
              <label className="staff-checkbox"><input type="checkbox" disabled={isSelf} checked={form.roles.includes("admin")} onChange={event => toggle("admin", event.target.checked)} />Администратор</label>
              {form.roles.includes("admin") && !selected?.roles.includes("admin") ? <label className="staff-checkbox"><input type="checkbox" required checked={form.confirmAdmin} onChange={event => setForm({ ...form, confirmAdmin: event.target.checked })} />Подтверждаю полный доступ к каталогу, сотрудникам, заказам и настройкам</label> : null}
            </details>
            {selected ? <label className="staff-checkbox"><input type="checkbox" disabled={isSelf} checked={form.status === "active"} onChange={event => setForm({ ...form, status: event.target.checked ? "active" : "inactive" })} />Сотрудник активен</label> : null}
            {selected?.assignments.length ? <div className="notice"><p>Есть незавершённые назначения. Перед отключением или снятием роли переназначьте работу:</p>{selected.assignments.map(item => <p key={`${item.id}:${item.role}`}><Link href={`/admin/delivery-waves/${item.id}`}>{roleLabels[item.role]}: открыть волну</Link></p>)}</div> : null}
            <button className="primary-action" disabled={!form.roles.length} type="submit">{selected ? "Сохранить сотрудника" : "Создать сотрудника"}</button>
          </fieldset>
        </form>
        {selected ? <form className="admin-form staff-password" onSubmit={event => { event.preventDefault(); setNotice(""); void resource.run(async () => {
          await adminRequest(`staff/${selected.id}/password`, "POST", { password }); setPassword(""); setNotice("Пароль изменён. Прежние сессии завершены.");
        }); }}><h3>Сброс пароля</h3><label>Новый пароль<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={event => setPassword(event.target.value)} /></label><button className="secondary-link" disabled={resource.busy}>Изменить пароль и завершить сессии</button></form> : null}
      </section>
    </div>
  </>;
}
