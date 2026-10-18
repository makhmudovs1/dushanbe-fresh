import type { PublicOrderDto } from "@dushanbe-fresh/shared";
import { isActiveOrder, rememberOrderActivity } from "./active-order";

export const lastOrderKey = "dushanbe-fresh.last-order";
export const lastOrderEvent = "dushanbe-fresh:last-order";
const validToken = (token: unknown): token is string => typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
export const trackingPath = (token: string) => `/order/${token}`;
export function rememberTracking(token: string) {
  if (!validToken(token)) return;
  try { window.localStorage.setItem(lastOrderKey, token); window.dispatchEvent(new Event(lastOrderEvent)); } catch { /* A private link also works without browser storage. */ }
}
export function lastTracking(): string | null {
  try {
    const token = window.localStorage.getItem(lastOrderKey);
    if (validToken(token)) return token;
    window.localStorage.removeItem(lastOrderKey);
  } catch { /* Storage can be disabled. */ }
  return null;
}
export function forgetTracking(token: string) {
  try {
    if (window.localStorage.getItem(lastOrderKey) !== token) return;
    window.localStorage.removeItem(lastOrderKey); window.dispatchEvent(new Event(lastOrderEvent));
  } catch { /* Do not block the page when storage is disabled. */ }
}

export type TrackingUpdate = { data?: PublicOrderDto; error?: "missing" | "network" };
export function pollTracking(token: string, update: (value: TrackingUpdate) => void) {
  let stopped = false; let busy = false; let timer: ReturnType<typeof setTimeout>;
  let controller: AbortController | undefined;
  async function refresh() {
    if (stopped || busy) return;
    clearTimeout(timer); busy = true;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 12000);
    try {
      // Preserve same-site transport cookies (e.g. tunnel consent), without staff authorization.
      const response = await fetch(`/api/v1/public/orders/${encodeURIComponent(token)}`, { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" }, signal: controller.signal, referrerPolicy: "no-referrer" });
      if (stopped) return;
      if (response.status === 404) {
        forgetTracking(token); update({ error: "missing" }); stopped = true; return;
      }
      if (!response.ok) throw new Error("Request failed");
      const data = await response.json() as PublicOrderDto;
      rememberOrderActivity(token, isActiveOrder(data));
      if (!stopped) update({ data });
    } catch { if (!stopped) update({ error: "network" }); }
    finally {
      clearTimeout(timeout); busy = false;
      if (!stopped) timer = setTimeout(() => void refresh(), 20000);
    }
  }
  void refresh();
  return { refresh, stop() { stopped = true; clearTimeout(timer); controller?.abort(); } };
}
