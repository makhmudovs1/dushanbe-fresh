import type { PublicOrderDto } from "@dushanbe-fresh/shared";

export const orderActivityEvent = "dushanbe-fresh:order-activity";
const activity = new Map<string, { active: boolean; checkedAt: number }>();

export function isActiveOrder(order: Pick<PublicOrderDto, "status" | "replacements">) {
  const active = (status: string) => ["order_received", "preparing", "packed", "out_for_delivery", "needs_attention", "replacement_scheduled"].includes(status);
  return active(order.status) || Boolean(order.replacements?.some(replacement => active(replacement.status)));
}

// Memory only, keyed by the private token. Never cache addresses/order DTOs or remove history.
export function rememberOrderActivity(token: string, active: boolean) {
  activity.set(token, { active, checkedAt: Date.now() });
  if (typeof window !== "undefined") window.dispatchEvent(new Event(orderActivityEvent));
}
export function orderActivity(token: string) { return activity.get(token); }
