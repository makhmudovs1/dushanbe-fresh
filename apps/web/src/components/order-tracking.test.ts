import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PublicOrderDto } from "@dushanbe-fresh/shared";
import { OrderTrackingView } from "./order-tracking";

const data: PublicOrderDto = {
  orderNumber: "DF-TEST", status: "order_received", progress: 0, message: null,
  deliverySlot: { date: "2099-01-01", startsAt: "10:00", endsAt: "12:00" },
  address: { city: "Душанбе", street: "Тестовая", building: "1", apartment: "", entrance: "", floor: "" },
  items: [{ name: "Помидоры", quantity: "2.000", unit: "kg", total: "20.00" }],
  money: { goods: "20.00", serviceFee: "0.00", deliveryFee: "5.00", discount: "0.00", original: "25.00", payable: "25.00", collected: "0.00", amountToCollect: "25.00", refundDue: "0.00", adjustments: [] }, replacements: []
};
describe("tracking loading and errors", () => {
  it("shows a skeleton only while the initial result is pending", () => {
    const html = renderToStaticMarkup(createElement(OrderTrackingView, { data: null, retry() {} }));
    expect(html).toContain('aria-busy="true"'); expect(html).toContain('class="skeleton ');
    expect(html).not.toContain('role="alert"');
  });
  it("removes the skeleton after initial failure and offers retry", () => {
    const html = renderToStaticMarkup(createElement(OrderTrackingView, { data: null, error: "network", retry() {} }));
    expect(html).toContain("Не удалось загрузить заказ"); expect(html).toContain("Попробовать снова");
    expect(html).not.toContain("skeleton"); expect(html).not.toContain('aria-busy="true"');
  });
  it("shows the first successful order without a skeleton", () => {
    const html = renderToStaticMarkup(createElement(OrderTrackingView, { data, retry() {} }));
    expect(html).toContain("DF-TEST"); expect(html).toContain("Заказ принят"); expect(html).toContain("Помидоры");
    expect(html).not.toContain("skeleton"); expect(html).not.toContain('role="alert"');
  });
  it("preserves loaded order details on polling failure", () => {
    const html = renderToStaticMarkup(createElement(OrderTrackingView, { data, error: "network", retry() {} }));
    expect(html).toContain("Не удалось обновить статус"); expect(html).toContain("DF-TEST"); expect(html).toContain("25 сомони");
    expect(html).not.toContain("skeleton"); expect(html).not.toContain("Не удалось загрузить заказ");
  });
});
