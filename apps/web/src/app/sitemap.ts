import type { MetadataRoute } from "next";
import { getPublicProducts } from "@/lib/catalog.server";
import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getPublicProducts();
  // A backend outage must not look like a successful removal of all product URLs.
  if (products === null) throw new Error("Public catalog is unavailable for sitemap generation");
  const paths = ["/", "/catalog", "/about", ...products.map(product => `/products/${encodeURIComponent(product.slug)}`)];
  return [...new Set(paths)].map(path => ({ url: new URL(path, SITE_URL).href }));
}
