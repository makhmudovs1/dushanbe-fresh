import { afterEach, describe, expect, it, vi } from "vitest";
import { updateCatalogLocation } from "./catalog-navigation";

afterEach(() => { vi.unstubAllGlobals(); });
describe("query-only catalog navigation", () => {
  it("retains opaque history state and notifies URL subscribers", () => {
    const state = { marker: "owned by router" };
    const pushState = vi.fn(), dispatchEvent = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/catalog", origin: "https://test.invalid", href: "https://test.invalid/catalog" }, history: { state, pushState }, dispatchEvent });
    vi.stubGlobal("PopStateEvent", class { type: string; state: unknown; constructor(type: string, init: { state: unknown }) { this.type = type; this.state = init.state; } });
    expect(updateCatalogLocation("/catalog?search=test")).toBe(true);
    expect(pushState).toHaveBeenCalledWith(state, "", "/catalog?search=test");
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "popstate", state }));
    expect(state).toEqual({ marker: "owned by router" });
  });
  it("leaves cross-route navigation to Next and never accepts external URLs", () => {
    const pushState = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/catalog", origin: "https://test.invalid", href: "https://test.invalid/catalog" }, history: { state: {}, pushState } });
    expect(updateCatalogLocation("/favorites")).toBe(false);
    expect(updateCatalogLocation("https://other.invalid/catalog")).toBe(false);
    expect(pushState).not.toHaveBeenCalled();
  });
});
