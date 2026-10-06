import type { ItemStatus, OrderStatus, WaveStatus } from "@dushanbe-fresh/shared";
import { staffFetch } from "./staff-auth";

export const orderLabels: Record<OrderStatus, string> = { pending_review: "Ожидает оператора", draft: "Черновик", placed: "Новый", confirmed: "Подтверждён", picking: "Сборка", picked: "Собран", out_for_delivery: "У курьера", delivered: "Доставлен", cancelled: "Отменён" };
export const waveLabels: Record<WaveStatus, string> = { open: "Ожидает сборки", picking: "Сборка", picked: "Собрана", out_for_delivery: "Доставка", delivered: "Завершена", cancelled: "Отменена" };
export const itemLabels: Record<ItemStatus, string> = { requested: "Ожидает сборки", picked: "Собран", replaced: "Заменён", removed: "Убран", unavailable: "Нет в наличии" };
export const paymentLabels: Record<string, string> = { unpaid: "Не оплачен", partial: "Расхождение оплаты", pending: "Ожидает оплаты", paid: "Оплачен", failed: "Ошибка оплаты", refunded: "Возвращён" };
export const policyLabels: Record<string, string> = { replace_similar: "Заменить похожим", contact_me: "Связаться с клиентом", remove_item: "Убрать отсутствующий товар" };
export const dateTime = (value: string) => new Date(value).toLocaleString("ru-RU", { timeZone: "Asia/Dushanbe" });
export type AdminSlot = { id: string; date: string; startsAt: string; endsAt: string; wave: { id: string; status: WaveStatus } | null };
export function adminSlotLabel(slot: AdminSlot) {
  return `${new Date(slot.date).toLocaleDateString("ru-RU", { timeZone: "UTC" })}, ${slot.startsAt.slice(11, 16)}–${slot.endsAt.slice(11, 16)}`;
}
export async function adminRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await staffFetch(`/api/v1/admin/${path}`, { method, cache: "no-store",
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.message === "string" ? data.message : "Не удалось выполнить действие. Повторите попытку.");
  return data as T;
}
