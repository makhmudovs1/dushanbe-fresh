import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AdminOrder } from "@dushanbe-fresh/shared";
import { CourierOrders } from "./courier-delivery";
import { courierNavigation } from "@/lib/courier-navigation";

describe("courier address", () => {
  it("renders saved coordinates and a latitude-first navigation destination", () => {
    const address = { city: "Душанбе", street: "Рудаки", building: "15", recipientName: "Тест", phone: "+992900000000", apartment: "", entrance: "", floor: "", instructions: "", latitude: 38.56234, longitude: 68.77123 };
    const order = { id: "test", orderNumber: "TEST-1", status: "out_for_delivery", paymentStatus: "pending", address, totalFinal: "25.20" } as AdminOrder;
    const html = renderToStaticMarkup(<CourierOrders orders={[order]} busy={false} run={async action => { await action(); }} />);
    expect(html).toContain("38.56234, 68.77123");
    expect(html).toContain('href="https://www.google.com/maps/dir/?api=1&amp;destination=38.56234,68.77123"');
    expect(html).toContain('rel="noopener noreferrer"');
    const legacy = renderToStaticMarkup(<CourierOrders orders={[{ ...order, address: { ...address, latitude: null, longitude: null } }]} busy={false} run={async () => {}} />);
    expect(legacy).not.toContain("Открыть навигацию");
    expect(legacy).toContain("Рудаки");
  });
  it("rejects partial and invalid coordinates without breaking old orders", () => {
    for (const address of [{}, { latitude: 38.56 }, { latitude: Infinity, longitude: 68.77 }, { latitude: 91, longitude: 68.77 }, { latitude: 38.56, longitude: 181 }]) expect(courierNavigation(address)).toBeNull();
    expect(courierNavigation({ latitude: 0, longitude: 0 })?.url).toContain("destination=0,0");
  });
});
