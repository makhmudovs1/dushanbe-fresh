import { ApiClient, normalizeApiUrl } from "../src/api/client";
import { readAuthStatus } from "../src/api/capabilities";
import { GeocodingClient } from "../src/api/geocoding";
import {
  parseProducts,
  parseCategories,
  isProduct,
} from "../src/domain/catalog";
async function main() {
  // Strictly read-only smoke. Never submits checkout, SMS or geocoder requests.
  const base = (
    process.env.EXPO_PUBLIC_API_URL ?? "https://dushanbefresh.tj/api/v1"
  ).replace(/\/$/, "");
  const client = new ApiClient(normalizeApiUrl(base), fetch, 30000);
  const read = (path: string) => client.request<unknown>(path);
  const products = parseProducts(await read("/products"));
  const categories = parseCategories(await read("/categories"));
  const status = await client.request<{ enabled: boolean }>(
    "/customer-auth/status",
  );
  const zone = await client.request<{ version: number; enabled: boolean }>(
    "/delivery-zone",
  );
  const nativeAuth = await readAuthStatus(client);
  const nativeGeo = await new GeocodingClient(client, () => null).status();
  if (
    !Array.isArray(products) ||
    !Array.isArray(categories) ||
    !products.length ||
    typeof status.enabled !== "boolean" ||
    zone.version !== 1
  )
    throw new Error("Public API contract mismatch");
  const first = products[0]!;
  const detail = await read(`/products/${encodeURIComponent(first.slug)}`);
  const found = parseProducts(
    await read(`/products?search=${encodeURIComponent(first.name)}`),
  );
  if (
    !isProduct(detail) ||
    detail.id !== first.id ||
    !found.some((p) => p.id === first.id)
  )
    throw new Error("Product detail/search mismatch");
  const image = new URL(first.image!, new URL(base).origin);
  const photo = await fetch(image, {
    method: "GET",
    credentials: "omit",
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  if (!photo.ok || !photo.headers.get("content-type")?.startsWith("image/"))
    throw new Error("Catalog photo is not available");
  console.log(
    JSON.stringify({
      products: products.length,
      categories: categories.length,
      detail: "ok",
      search: "ok",
      photo: "ok",
      customerAuthEnabled: status.enabled,
      nativeAuthAvailable: nativeAuth.available,
      nativeAuthEnabled: nativeAuth.enabled,
      nativeGeocodingEnabled: nativeGeo.enabled,
      deliveryZoneEnabled: zone.enabled,
      mutations: 0,
    }),
  );
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Public API check failed",
  );
  process.exitCode = 1;
});
