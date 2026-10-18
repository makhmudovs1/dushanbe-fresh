import { expect, request as requestFactory } from "@playwright/test";
import type { Category, Product } from "../src/lib/api";

export async function localCatalogFixtures(baseURL: string) {
  expect(process.env.RUN_MUTATING_UI_TESTS).toBe("1");
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL).hostname);
  const request = await requestFactory.newContext({ baseURL });
  const origin = new URL(baseURL).origin;
  const login = await request.post("/api/v1/auth/admin/login", { headers: { Origin: origin }, data: { email: process.env.UI_ADMIN_EMAIL, password: process.env.UI_ADMIN_PASSWORD } });
  if (!login.ok()) await request.dispose();
  expect(login.ok()).toBe(true);
  const headers = { Authorization: `Bearer ${(await login.json()).accessToken}`, Origin: origin };
  const productIds: string[] = [], categoryIds: string[] = [];
  async function category(data: Record<string, unknown>) {
    const response = await request.post("/api/v1/admin/categories", { headers, data });
    expect(response.ok()).toBe(true);
    const result = await response.json() as Category; categoryIds.push(result.id); return result;
  }
  async function product(data: Record<string, unknown>) {
    const response = await request.post("/api/v1/admin/products", { headers, data });
    expect(response.ok()).toBe(true);
    const result = await response.json() as Product; productIds.push(result.id); return result;
  }
  return { headers, category, product, async cleanup() {
    try {
      for (const id of productIds) expect((await request.delete(`/api/v1/admin/products/${id}`, { headers })).ok()).toBe(true);
      for (const id of [...categoryIds].reverse()) expect((await request.delete(`/api/v1/admin/categories/${id}`, { headers })).ok()).toBe(true);
    } finally { await request.dispose(); }
  } };
}
