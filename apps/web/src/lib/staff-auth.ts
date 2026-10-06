import type { StaffLogin, StaffUser } from "@dushanbe-fresh/shared";

let accessToken: string | null = null;
let refreshFlight: Promise<StaffUser> | null = null;
export const staffEvent = "staff-session-changed";
function publish(user: StaffUser | null) {
  window.dispatchEvent(new CustomEvent(staffEvent, { detail: user }));
}
async function authRequest(path: string, body?: unknown) {
  const response = await fetch(`/api/v1/auth/${path}`, { method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message ?? "Не удалось войти. Повторите попытку.");
  }
  return response;
}
export async function loginStaff(email: string, password: string) {
  const result: StaffLogin = await (await authRequest("admin/login", { email, password })).json();
  accessToken = result.accessToken; publish(result.user); return result.user;
}
export function refreshStaff(): Promise<StaffUser> {
  if (!refreshFlight) {
    const run = async () => {
      const result: StaffLogin = await (await authRequest("refresh")).json();
      accessToken = result.accessToken; publish(result.user); return result.user;
    };
    // Serialize refreshes across tabs as well as within this document when Web Locks is available.
    refreshFlight = (typeof navigator !== "undefined" && navigator.locks ? navigator.locks.request("staff-refresh", run) : run())
      .catch(error => { accessToken = null; publish(null); throw error; }).finally(() => { refreshFlight = null; });
  }
  return refreshFlight;
}
export async function logoutStaff() {
  if (refreshFlight) await refreshFlight.catch(() => undefined);
  await authRequest("logout"); accessToken = null; publish(null);
}
export async function staffFetch(url: string, init?: RequestInit) {
  if (!accessToken) await refreshStaff();
  const request = () => fetch(url, { ...init, cache: "no-store", credentials: "same-origin", headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` } });
  let response = await request();
  if (response.status === 401) { await refreshStaff(); response = await request(); }
  return response;
}
export const staffHome = (user: StaffUser) => user.roles.includes("admin") ? "/admin/orders" : "/admin/delivery-waves";
export const roleLabels = { admin: "Администратор", picker: "Сборщик", courier: "Курьер" };
export function canOpenStaffPage(path: string, user: StaffUser) {
  return user.roles.includes("admin") || path === "/admin/delivery-waves" || (path === "/admin/cash" && user.roles.includes("courier")) || /^\/admin\/(delivery-waves|orders)\/[^/]+$/.test(path);
}
