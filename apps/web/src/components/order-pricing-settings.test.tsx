import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OrderPricingSettings } from "./order-pricing-settings";

const run = vi.fn();
const settings = [
  { key: "minimum_order_amount", value: "120.00" },
  { key: "delivery_fee", value: "20.00" },
  { key: "service_fee", value: "0.00" }
];

describe("order pricing settings", () => {
  it("waits for loaded settings without invented defaults", () => {
    expect(renderToStaticMarkup(<OrderPricingSettings settings={null} busy run={run} />)).toBe("");
  });
  it("shows three empty required fields when production settings are missing", () => {
    const html = renderToStaticMarkup(<OrderPricingSettings settings={[]} busy={false} run={run} />);
    expect(html).toContain("Условия заказа не настроены");
    expect(html.match(/value=""/g)).toHaveLength(3);
    expect(html.match(/required=""/g)).toHaveLength(3);
    expect(html).toContain('name="minimumOrderAmount"');
    expect(html).toContain('name="deliveryFee"');
    expect(html).toContain('name="serviceFee"');
  });
  it("preserves existing amounts including zero", () => {
    const html = renderToStaticMarkup(<OrderPricingSettings settings={settings} busy={false} run={run} />);
    for (const { value } of settings) expect(html).toContain(`value="${value}"`);
    expect(html).not.toContain("Условия заказа не настроены");
    expect(html).not.toContain("Действует сервисный сбор");
  });
  it("disables all inputs and submission while saving", () => {
    expect(renderToStaticMarkup(<OrderPricingSettings settings={settings} busy run={run} />).match(/disabled=""/g)).toHaveLength(4);
  });
  it("makes an existing percentage policy explicit without changing it", () => {
    const html = renderToStaticMarkup(<OrderPricingSettings settings={[...settings, { key: "service_fee_percent", value: "5" }]} busy={false} run={run} />);
    expect(html).toContain("Действует сервисный сбор 5%");
  });
});
