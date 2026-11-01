import { afterEach, describe, expect, it, vi } from "vitest";
import { applyAdminPricing, getAdminPricingSettings, getLastAdminPricingBatch, previewAdminPricing, undoAdminPricing, updateAdminPricingSettings } from "./api";
import { staffFetch } from "./staff-auth";

vi.mock("./staff-auth", () => ({ staffFetch: vi.fn() }));
afterEach(() => vi.resetAllMocks());

describe("admin pricing API contract", () => {
  it("uses Ampere's single pricing settings API and authenticated client", async () => {
    vi.mocked(staffFetch).mockResolvedValue({ ok: true, json: async () => ({ defaultMarkupPercent: "10.00" }) } as Response);
    await getAdminPricingSettings();
    expect(staffFetch).toHaveBeenLastCalledWith("/api/v1/admin/pricing/settings", expect.objectContaining({ cache: "no-store" }));
    await updateAdminPricingSettings({ defaultMarkupPercent: "15.00" });
    expect(staffFetch).toHaveBeenLastCalledWith("/api/v1/admin/pricing/settings", expect.objectContaining({ method: "PATCH", body: '{"defaultMarkupPercent":"15.00"}' }));
  });
  it("sends server-side selections, explicit manual consent, preview token and stable request IDs", async () => {
    vi.mocked(staffFetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    for (const selection of [{ ids: ["a", "b"] }, { categoryIds: ["veg", "fruit"] }, { all: true as const }]) {
      const payload = { selection, markupPercent: "20.00", overwriteManual: false };
      await previewAdminPricing(payload);
      expect(staffFetch).toHaveBeenLastCalledWith("/api/v1/admin/pricing/bulk/preview", expect.objectContaining({ method: "POST", body: JSON.stringify(payload) }));
    }
    await applyAdminPricing({ previewId: "preview", requestId: "apply-id" });
    expect(staffFetch).toHaveBeenLastCalledWith("/api/v1/admin/pricing/bulk/apply", expect.objectContaining({ body: '{"previewId":"preview","requestId":"apply-id"}' }));
    await undoAdminPricing({ batchId: "batch", requestId: "undo-id" });
    expect(staffFetch).toHaveBeenLastCalledWith("/api/v1/admin/pricing/bulk/undo", expect.objectContaining({ body: '{"batchId":"batch","requestId":"undo-id"}' }));
    await getLastAdminPricingBatch();
    expect(staffFetch).toHaveBeenLastCalledWith("/api/v1/admin/pricing/bulk/last", expect.any(Object));
  });
  it("surfaces server conflicts without a client-side fallback write", async () => {
    vi.mocked(staffFetch).mockResolvedValue({ ok: false, json: async () => ({ message: "Цены изменились" }) } as Response);
    await expect(applyAdminPricing({ previewId: "stale", requestId: "id" })).rejects.toThrow("Цены изменились");
    expect(staffFetch).toHaveBeenCalledTimes(1);
  });
});
