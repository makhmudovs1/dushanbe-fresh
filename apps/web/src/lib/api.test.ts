import { afterEach, describe, expect, it, vi } from "vitest";

import { getCategories, getProducts } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("catalog requests", () => {
  it("loads categories through the web origin without a hardcoded API host", async () => {
    const categories = [{ id: "1", name: "Овощи", slug: "vegetables", sortOrder: 10 }];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => categories });
    vi.stubGlobal("fetch", fetchMock);

    expect(await getCategories()).toEqual(categories);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/categories", expect.any(Object));
  });

  it("preserves category and search filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);
    await getProducts({ category: "vegetables", search: "сладкий перец" });

    const url = new URL(fetchMock.mock.calls[0][0], "http://localhost:3001");
    expect(url.pathname).toBe("/api/v1/products");
    expect(url.searchParams.get("category")).toBe("vegetables");
    expect(url.searchParams.get("search")).toBe("сладкий перец");
  });

  it("reports an API failure instead of returning fallback categories", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => null }));
    await expect(getCategories()).rejects.toThrow("Не удалось выполнить запрос");
  });
});
