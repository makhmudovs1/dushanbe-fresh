import { afterEach, describe, expect, it, vi } from "vitest";
import { HOME_TITLE, SITE_URL, privateMetadata, publicMetadata } from "./seo";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { generateMetadata } from "../app/products/[slug]/page";
import { getInitialProduct, getPublicProducts } from "./catalog.server";

vi.mock("./catalog.server", () => ({ getInitialProduct: vi.fn(), getPublicProducts: vi.fn() }));
vi.mock("@/components/product-data", () => ({ ProductData: () => null }));
afterEach(() => { vi.resetAllMocks(); });

describe("public SEO", () => {
  it("uses the requested Russian home title, canonical and absolute social image", () => {
    const meta = publicMetadata("/", HOME_TITLE, "Описание");
    expect(meta.title).toBe("Dushanbe Fresh — доставка свежих продуктов в Душанбе");
    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/`);
    expect(meta.robots).toEqual({ index: true, follow: true });
    expect(meta.openGraph).toMatchObject({ url: `${SITE_URL}/`, locale: "ru_RU", title: HOME_TITLE, images: [{ url: `${SITE_URL}/brand/og-v3.png`, width: 1200, height: 630 }] });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("keeps private pages noindex without canonical or order-specific social data", () => {
    expect(privateMetadata("Корзина")).toEqual({ title: "Корзина | Dushanbe Fresh", robots: { index: false, follow: false } });
  });

  it("allows public crawling and noindex discovery, advertises the sitemap", () => {
    expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/", disallow: "/api/" }, sitemap: `${SITE_URL}/sitemap.xml` });
  });

  it("lists only public pages and deduplicated public product URLs", async () => {
    vi.mocked(getPublicProducts).mockResolvedValue([{ slug: "tomatoes" }, { slug: "tomatoes" }, { slug: "зелень" }] as Awaited<ReturnType<typeof getPublicProducts>>);
    expect(await sitemap()).toEqual(["/", "/catalog", "/about", "/products/tomatoes", `/products/${encodeURIComponent("зелень")}`].map(path => ({ url: `${SITE_URL}${path}` })));
  });

  it("does not silently publish an incomplete sitemap on API failure", async () => {
    vi.mocked(getPublicProducts).mockResolvedValue(null);
    await expect(sitemap()).rejects.toThrow("Public catalog is unavailable");
  });

  it("sets product-specific metadata without putting prices in search snippets", async () => {
    vi.mocked(getInitialProduct).mockResolvedValue({ slug: "tomatoes", name: "Помидоры", description: "Свежие помидоры" } as NonNullable<Awaited<ReturnType<typeof getInitialProduct>>>);
    const meta = await generateMetadata({ params: Promise.resolve({ slug: "tomatoes" }) });
    expect(meta.title).toBe("Помидоры с доставкой в Душанбе | Dushanbe Fresh");
    expect(meta.description).toBe("Свежие помидоры");
    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/products/tomatoes`);
  });

  it("does not index an unavailable or failed product response", async () => {
    vi.mocked(getInitialProduct).mockResolvedValue(null);
    expect((await generateMetadata({ params: Promise.resolve({ slug: "missing" }) })).robots).toEqual({ index: false, follow: false });
  });
});
