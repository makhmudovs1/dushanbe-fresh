import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import { GeocodingClient } from "./geocoding";
const item = {
  street: "Тестовая",
  building: "1",
  latitude: 38.5,
  longitude: 68.8,
  apartment: "",
  entrance: "",
  floor: "",
  instructions: "",
};
describe("native geocoding boundary", () => {
  it("uses one short-lived guest capability and sends no static app key or fake Origin", async () => {
    const calls: { path: string; init: RequestInit | undefined }[] = [];
    const fetcher: typeof fetch = async (url, init) => {
      const path = String(url);
      calls.push({ path, init });
      return new Response(
        JSON.stringify(
          path.endsWith("/grant")
            ? {
                grant: "a".repeat(64),
                expiresAt: new Date(Date.now() + 300000).toISOString(),
              }
            : { items: [item] },
        ),
      );
    };
    const geo = new GeocodingClient(
      new ApiClient("https://test.invalid/api/v1", fetcher),
      () => null,
    );
    await Promise.all([
      geo.search("Тестовая", "ru"),
      geo.reverse({ latitude: 38.50001, longitude: 68.80001 }, "tg"),
    ]);
    expect(calls.filter((c) => c.path.endsWith("/grant"))).toHaveLength(1);
    const sent = calls.find((c) => c.path.endsWith("/search"))!.init!;
    expect(sent.headers).toMatchObject({
      "X-DF-Geocoder-Grant": "a".repeat(64),
    });
    expect(sent.headers).not.toHaveProperty("Origin");
    expect(JSON.parse(String(sent.body))).toEqual({
      query: "Тестовая",
      language: "ru",
    });
  });
  it("uses authenticated transport without minting anonymous grants", async () => {
    const transport = vi.fn().mockResolvedValue({ items: [item] });
    const fetcher = vi.fn();
    const geo = new GeocodingClient(
      new ApiClient("https://test.invalid/api/v1", fetcher),
      transport,
    );
    await geo.search("Тестовая", "tg");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("treats the old production API as geocoder unavailable", async () => {
    const geo = new GeocodingClient(
      new ApiClient(
        "https://test.invalid/api/v1",
        async () => new Response("{}", { status: 404 }),
      ),
      () => null,
    );
    expect(await geo.status()).toEqual({ enabled: false });
  });
  it("rejects malformed coordinates instead of inventing an address", async () => {
    const geo = new GeocodingClient(
      new ApiClient("https://test.invalid/api/v1"),
      async () => ({ items: [{ ...item, latitude: NaN }] }),
    );
    await expect(
      geo.reverse({ latitude: 38.5, longitude: 68.8 }, "ru"),
    ).rejects.toMatchObject({ code: "response" });
  });
});
