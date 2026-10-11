import { afterEach, describe, expect, it, vi } from "vitest";
import { getInitialCatalog, getInitialProduct } from "./catalog.server";

// React cache is supplied by Next's server renderer, not the React 18 test runtime.
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("streamed public catalog data", () => {
  it("starts independent requests together and preserves the category filter", async () => {
    vi.stubEnv("API_URL", "http://api.internal:4000/api/v1/");
    const resolvers: Array<(response: Response) => void> = [];
    const fetcher = vi.fn(() => new Promise<Response>(resolve => resolvers.push(resolve)));
    vi.stubGlobal("fetch", fetcher);
    const result = getInitialCatalog("nuts & fruit");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]).toEqual(["http://api.internal:4000/api/v1/products?category=nuts+%26+fruit", expect.any(Object)]);
    resolvers[0](Response.json([{ id: "category" }]));
    resolvers[1](Response.json([{ id: "product" }]));
    await expect(result).resolves.toEqual({ categories: [{ id: "category" }], products: [{ id: "product" }] });
  });

  it("does not cache prices/availability or forward cookies and authorization", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ id: "product" }));
    vi.stubGlobal("fetch", fetcher);
    await getInitialProduct("tomato/green");
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/products/tomato%2Fgreen"), {
      cache: "no-store", headers: { Accept: "application/json" }, signal: expect.any(AbortSignal)
    });
  });

  it("keeps available products when categories fail, without disguising failure as an empty category list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(Response.json([])));
    await expect(getInitialCatalog()).resolves.toEqual({ categories: null, products: [] });
  });

  it.each(["network", "invalid-json", "missing"])("returns a retryable error state for %s, not an endless loading state", async (reason) => {
    const fetcher = vi.fn();
    if (reason === "network") fetcher.mockRejectedValue(new Error("offline"));
    else fetcher.mockResolvedValue(new Response("not json", { status: reason === "missing" ? 404 : 200 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(getInitialProduct("tomato")).resolves.toBeNull();
  });
});
