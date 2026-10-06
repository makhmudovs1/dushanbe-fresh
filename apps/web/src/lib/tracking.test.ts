import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetTracking, lastOrderKey, lastTracking, pollTracking, rememberTracking, trackingPath } from "./tracking";
import { finishCheckout } from "./checkout";
import type { CreateOrderInput } from "@dushanbe-fresh/shared";

const token = "a".repeat(64);
function storage() {
  const values = new Map<string, string>();
  const localStorage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
  vi.stubGlobal("window", { localStorage, sessionStorage: localStorage, dispatchEvent: vi.fn() });
  return localStorage;
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("customer tracking", () => {
  it("remembers only the last token after checkout and works when storage is disabled", async () => {
    const local = storage();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ orderNumber: "DF-test", publicTrackingToken: token }) }));
    await finishCheckout({} as CreateOrderInput, vi.fn());
    expect(local.getItem(lastOrderKey)).toBe(token); expect(lastTracking()).toBe(token);
    expect(trackingPath(token)).toBe(`/order/${token}`);
    vi.stubGlobal("window", { get localStorage() { throw new Error("disabled"); } });
    expect(() => rememberTracking(token)).not.toThrow(); expect(lastTracking()).toBeNull();
  });
  it("clears invalid data but never clears a newer last order for an older missing link", () => {
    const local = storage(); local.setItem(lastOrderKey, "internal-id"); expect(lastTracking()).toBeNull();
    rememberTracking(token); forgetTracking("b".repeat(64)); expect(lastTracking()).toBe(token);
    forgetTracking(token); expect(lastTracking()).toBeNull();
  });
  it("uses the relative proxy with same-origin transport cookies, no staff authorization, and polls softly", async () => {
    vi.useFakeTimers(); const update = vi.fn();
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ status: "order_received" }) })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "preparing" }) });
    vi.stubGlobal("fetch", fetch);
    const polling = pollTracking(token, update); await vi.advanceTimersByTimeAsync(0);
    expect(update).toHaveBeenLastCalledWith({ data: { status: "order_received" } });
    expect(fetch.mock.calls[0][0]).toBe(`/api/v1/public/orders/${token}`);
    expect(fetch.mock.calls[0][1]).toMatchObject({ cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" }, referrerPolicy: "no-referrer" });
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty("ngrok-skip-browser-warning");
    await vi.advanceTimersByTimeAsync(20000); expect(update).toHaveBeenLastCalledWith({ error: "network" });
    await vi.advanceTimersByTimeAsync(20000); expect(update).toHaveBeenLastCalledWith({ data: { status: "preparing" } });
    polling.stop(); await vi.advanceTimersByTimeAsync(40000); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("treats an HTTP 200 HTML gateway page as a failed completed attempt and retries", async () => {
    vi.useFakeTimers(); const update = vi.fn();
    const fetch = vi.fn().mockResolvedValueOnce(new Response("<!DOCTYPE html><html>Gateway notice</html>", { headers: { "Content-Type": "text/html" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "order_received" }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    const polling = pollTracking(token, update); await vi.advanceTimersByTimeAsync(0);
    expect(update).toHaveBeenLastCalledWith({ error: "network" });
    await polling.refresh(); expect(update).toHaveBeenLastCalledWith({ data: { status: "order_received" } });
    polling.stop();
  });
  it("starts the polling interval only after the initial request finishes", async () => {
    vi.useFakeTimers(); const update = vi.fn(); let resolve!: (value: unknown) => void;
    const fetch = vi.fn().mockImplementation(() => new Promise(done => { resolve = done; })); vi.stubGlobal("fetch", fetch);
    const polling = pollTracking(token, update); await vi.advanceTimersByTimeAsync(5000);
    await polling.refresh(); expect(fetch).toHaveBeenCalledTimes(1);
    resolve({ ok: true, json: async () => ({ status: "order_received" }) }); await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(19999); expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(fetch).toHaveBeenCalledTimes(2); polling.stop();
  });
  it("stops polling a missing order and supports retry after a temporary failure", async () => {
    vi.useFakeTimers(); storage(); rememberTracking(token); const update = vi.fn();
    const fetch = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ status: 404 }); vi.stubGlobal("fetch", fetch);
    const polling = pollTracking(token, update); await vi.advanceTimersByTimeAsync(0); await polling.refresh();
    expect(update).toHaveBeenLastCalledWith({ error: "missing" }); expect(lastTracking()).toBeNull();
    await vi.advanceTimersByTimeAsync(60000); expect(fetch).toHaveBeenCalledTimes(2); polling.stop();
  });
  it("never overlaps requests and aborts an outstanding request when leaving the page", async () => {
    vi.useFakeTimers(); const update = vi.fn();
    const fetch = vi.fn().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("aborted")));
    })); vi.stubGlobal("fetch", fetch);
    const polling = pollTracking(token, update); await polling.refresh();
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(12000); expect(update).toHaveBeenCalledWith({ error: "network" });
    await vi.advanceTimersByTimeAsync(20000); expect(fetch).toHaveBeenCalledTimes(2);
    polling.stop(); await vi.advanceTimersByTimeAsync(100000);
    expect(update).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("tracking metadata is generic, noindex/nofollow and no-referrer", () => {
    const source = readFileSync(new URL("../app/order/[trackingToken]/page.tsx", import.meta.url), "utf8");
    expect(source).toContain('robots: { index: false, follow: false }'); expect(source).toContain('referrer: "no-referrer"');
    expect(source).not.toContain("generateMetadata");
  });
});
