import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import { readAuthStatus } from "./capabilities";
describe("legacy backend compatibility", () => {
  it("reports unavailable native login even when old browser OTP is enabled", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 404 }))
      .mockResolvedValueOnce(
        new Response('{"enabled":true,"requiredForCheckout":true}'),
      );
    expect(
      await readAuthStatus(new ApiClient("https://shop.test/api/v1", fetcher)),
    ).toEqual({ available: false, enabled: false, requiredForCheckout: true });
    expect(
      fetcher.mock.calls.every(([, options]) => options.method === "GET"),
    ).toBe(true);
  });
  it("does not turn a network outage into disabled authentication", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(
      readAuthStatus(new ApiClient("https://shop.test/api/v1", fetcher)),
    ).rejects.toMatchObject({ code: "network" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects contradictory or malformed capability responses", async () => {
    for (const value of [
      {},
      { available: false, enabled: true, requiredForCheckout: false },
    ]) {
      await expect(
        readAuthStatus(
          new ApiClient(
            "https://shop.test/api/v1",
            async () => new Response(JSON.stringify(value)),
          ),
        ),
      ).rejects.toMatchObject({ code: "response" });
    }
  });
});
