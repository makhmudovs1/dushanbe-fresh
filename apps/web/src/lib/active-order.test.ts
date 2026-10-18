import { describe, expect, it, vi, afterEach } from "vitest";
import { isActiveOrder, orderActivity, rememberOrderActivity } from "./active-order";
import type { PublicOrderDto } from "@dushanbe-fresh/shared";

afterEach(() => { vi.unstubAllGlobals(); });
describe("header active guest order", () => {
  it.each(["order_received", "preparing", "packed", "out_for_delivery", "needs_attention", "replacement_scheduled"] as const)("shows %s", status => {
    expect(isActiveOrder({ status, replacements: [] })).toBe(true);
  });
  it.each(["delivered", "cancelled"] as const)("hides %s without deleting a saved link", status => {
    expect(isActiveOrder({ status, replacements: [] })).toBe(false);
  });
  it("keeps an unfinished replacement visible", () => {
    expect(isActiveOrder({ status: "delivered", replacements: [{ status: "replacement_scheduled" }] as PublicOrderDto["replacements"] })).toBe(true);
  });
  it("caches only activity in memory, independently for each private token", () => {
    const event = vi.fn(); vi.stubGlobal("window", { dispatchEvent: event });
    rememberOrderActivity("test-token-a", true); rememberOrderActivity("test-token-b", false);
    expect(orderActivity("test-token-a")).toEqual({ active: true, checkedAt: expect.any(Number) });
    expect(orderActivity("test-token-b")?.active).toBe(false);
    expect(event).toHaveBeenCalledTimes(2);
  });
});
