"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginStaff, staffHome } from "@/lib/staff-auth";

export default function StaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <main className="staff-login"><div className="staff-login-inner">
    <p className="staff-brand">Dushanbe Fresh <span>Admin</span></p>
    <h1>Вход для сотрудников</h1>
    <form onSubmit={async event => { event.preventDefault(); setBusy(true); setError("");
      try { const user = await loginStaff(email, password); setPassword(""); router.replace(staffHome(user)); }
      catch (error) { setError(error instanceof Error ? error.message : "Не удалось войти."); }
      finally { setBusy(false); }
    }}>
      <label className="field">Email<input type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label className="field">Пароль<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
      {error ? <p className="notice" role="alert">{error}</p> : null}
      <button className="primary-action" disabled={busy}>{busy ? "Входим..." : "Войти"}</button>
    </form>
  </div></main>;
}
