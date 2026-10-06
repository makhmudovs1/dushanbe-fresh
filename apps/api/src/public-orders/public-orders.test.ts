import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { customerStatus } from "./public-orders.mapper";
import { PublicOrdersController, PublicOrdersService } from "./public-orders.module";

describe("public order privacy and status priorities", () => {
  it("does not query by malformed tokens or internal ids", async () => {
    const findUnique = vi.fn(); const service = new PublicOrdersService({ order: { findUnique } } as never);
    for (const token of ["123", "", "550e8400-e29b-41d4-a716-446655440000", "../admin/orders", "a".repeat(65)]) await expect(service.get(token)).rejects.toThrow("Заказ не найден");
    expect(findUnique).not.toHaveBeenCalled();
  });
  it("prioritizes cancellation and active issues, not resolved internal reviews", () => {
    expect(customerStatus({ status: "cancelled", issues: [{ status: "awaiting_admin" }] }, true)).toBe("cancelled");
    expect(customerStatus({ status: "delivered", issues: [{ status: "awaiting_admin" }] }, true)).toBe("needs_attention");
    expect(customerStatus({ status: "delivered", issues: [{ status: "resolved" }] }, true)).toBe("replacement_scheduled");
    expect(customerStatus({ status: "delivered", issues: [{ status: "resolved" }] })).toBe("delivered");
  });
  it("bounds public requests without requiring login and resets after a minute", () => {
    vi.useFakeTimers();
    try {
      const get = vi.fn(); const controller = new PublicOrdersController({ get } as never);
      for (let i = 0; i < 300; i++) controller.get("a".repeat(64), { ip: "127.0.0.1" });
      expect(() => controller.get("a".repeat(64), { ip: "127.0.0.1" })).toThrow("Слишком много запросов");
      vi.advanceTimersByTime(60001); expect(() => controller.get("a".repeat(64), { ip: "127.0.0.1" })).not.toThrow();
    } finally { vi.useRealTimers(); }
  });
});
