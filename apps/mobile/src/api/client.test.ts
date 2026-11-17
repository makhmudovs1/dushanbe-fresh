import { describe, expect, it, vi } from "vitest";
import {
  ApiClient,
  ApiError,
  mediaUrl,
  normalizeApiUrl,
  retryRead,
} from "./client";
describe("native API boundary", () => {
  it.each([
    "//foreign.invalid/path",
    "/mobile/customer/../../auth",
    "/mobile/customer/%2e%2e/auth",
    "/mobile/customer/%252e%252e/auth",
    "/mobile/customer/..\\auth",
    "/broken%zz",
  ])(
    "rejects escaping paths before attaching credentials: %s",
    async (path) => {
      const transport = vi.fn();
      const client = new ApiClient("https://shop.test/api/v1", transport);
      await expect(
        client.request(path, { accessToken: "private" }),
      ).rejects.toThrow("INVALID_PATH");
      expect(transport).not.toHaveBeenCalled();
    },
  );
  it.each([401, 403, 429, 500, 503])(
    "preserves HTTP %i without retrying a mutation",
    async (status) => {
      const transport = vi
        .fn()
        .mockResolvedValue(
          new Response('{"message":"private diagnostic"}', { status }),
        );
      const client = new ApiClient("https://shop.test/api/v1", transport);
      await expect(
        client.request("/checkout/orders", { method: "POST", body: {} }),
      ).rejects.toMatchObject({ code: "http", status, message: "http" });
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
  it("uses no browser cookies, Origin or staff credentials", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    const api = new ApiClient("https://shop.test/api/v1", fetcher);
    await api.request("/products");
    expect(fetcher).toHaveBeenCalledWith(
      "https://shop.test/api/v1/products",
      expect.objectContaining({
        credentials: "omit",
        redirect: "error",
        method: "GET",
        headers: { Accept: "application/json" },
      }),
    );
  });
  it("preserves structured 409 quote errors without exposing them as messages", async () => {
    const client = new ApiClient(
      "https://shop.test/api/v1",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response('{"quote":{"valid":false}}', { status: 409 }),
        ),
    );
    await expect(
      client.request("/checkout/orders", { method: "POST", body: {} }),
    ).rejects.toMatchObject({
      status: 409,
      code: "http",
      data: { quote: { valid: false } },
      message: "http",
    });
  });
  it("rejects an HTML proxy response", async () => {
    const client = new ApiClient(
      "https://shop.test/api/v1",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("<html>gateway</html>")),
    );
    await expect(client.request("/products")).rejects.toMatchObject({
      code: "response",
    });
  });
  it("sanitizes transport errors", async () => {
    const client = new ApiClient(
      "https://shop.test/api/v1",
      vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error("private token")),
    );
    await expect(client.request("/products")).rejects.toMatchObject({
      message: "network",
    });
  });
  it("aborts a hung request at its deadline", async () => {
    const client = new ApiClient(
      "https://shop.test/api/v1",
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        ),
      5,
    );
    await expect(client.request("/products")).rejects.toMatchObject({
      code: "timeout",
    });
  });
  it("propagates cancellation", async () => {
    const controller = new AbortController();
    const client = new ApiClient(
      "https://shop.test/api/v1",
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        ),
    );
    const promise = client.request("/products", { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: "cancelled" });
  });
  it("retries only safe transient reads", () => {
    expect(retryRead(0, new ApiError("network"))).toBe(true);
    expect(retryRead(2, new ApiError("timeout"))).toBe(false);
    expect(retryRead(0, new ApiError("http", 401))).toBe(false);
    expect(retryRead(0, new ApiError("http", 429))).toBe(false);
  });
  it("resolves root-relative media without duplicating /api/v1", () => {
    expect(mediaUrl("/api/v1/media/a.webp", "https://shop.test/api/v1")).toBe(
      "https://shop.test/api/v1/media/a.webp",
    );
    expect(
      mediaUrl("//evil.test/a", "https://shop.test/api/v1"),
    ).toBeUndefined();
    expect(
      mediaUrl("file:///etc/passwd", "https://shop.test/api/v1"),
    ).toBeUndefined();
  });
  it("requires HTTPS for release and a precise API base", () => {
    expect(normalizeApiUrl("https://shop.test/api/v1/", true)).toBe(
      "https://shop.test/api/v1",
    );
    for (const url of [
      "http://shop.test/api/v1",
      "https://secret@shop.test/api/v1",
      "https://shop.test/api/v1?key=x",
      "https://shop.test/api",
    ])
      expect(() => normalizeApiUrl(url, true)).toThrow();
  });
});
