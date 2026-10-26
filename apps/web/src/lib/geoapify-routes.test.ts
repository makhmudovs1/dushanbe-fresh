import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/address-search/route";
import { POST as reverse } from "@/app/api/address-reverse/route";

const key = "route-only-private-canary";
const row = { country_code: "tj", city: "Dushanbe", street: "Рудаки", housenumber: "15", lat: 38.56, lon: 68.77 };
function request(body: unknown, origin = "http://localhost:3133", contentType = "application/json") {
  return new Request("http://localhost:3133/api/address-search", { method: "POST", headers: { origin, "content-type": contentType }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.stubEnv("GEOAPIFY_API_KEY", key); vi.stubEnv("WEB_ORIGIN", "http://localhost:3133"); vi.stubEnv("NODE_ENV", "test");
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ results: [row] }))));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("address API routes", () => {
  it("publishes only capabilities, never keys or provider URLs", async () => {
    const response = await GET();
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ status: "configured", reverse: true, city: "Dushanbe", provider: "geoapify" });
    expect(text).not.toContain(key); expect(text).not.toContain("api.geoapify.com");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("searches and reverses through the server with sanitized results", async () => {
    const response = await POST(request({ query: "Рудаки", language: "tg" }));
    expect(await response.json()).toMatchObject({ status: "available", items: [{ street: "Рудаки", latitude: 38.56, longitude: 68.77 }] });
    const reversed = await reverse(request({ latitude: 38.562, longitude: 68.772, language: "tg" }));
    expect(await reversed.json()).toMatchObject({ status: "available", items: [{ latitude: 38.562, longitude: 68.772 }] });
  });
  it("rejects cross-origin requests, invalid input and bad content types before calling Geoapify", async () => {
    expect((await POST(request({ query: "Рудаки" }, "https://evil.example"))).status).toBe(403);
    expect((await POST(request({ query: "Рудаки" }, undefined, "text/plain"))).status).toBe(415);
    for (const query of ["Ру", "x".repeat(151), "Рудаки\u0000"]) expect((await POST(request({ query }))).status).toBe(400);
    expect((await POST(request({ query: "x".repeat(3000) }))).status).toBe(400);
    expect((await reverse(request({ latitude: 55, longitude: 37 }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("returns manual-entry fallback without upstream errors or credentials", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(`private error ${key}`, { status: 403 }));
    const response = await POST(request({ query: "Рудаки" }));
    expect(await response.json()).toEqual({ status: "unavailable", items: [] });
    vi.stubEnv("GEOAPIFY_API_KEY", ""); vi.stubEnv("ADDRESS_SEARCH_URL", "");
    expect(await (await GET()).json()).toMatchObject({ status: "unavailable", reverse: false });
  });
});
