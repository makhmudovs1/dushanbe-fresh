import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SiteHeader } from "./site-header";

const route = vi.hoisted(() => ({ path: "/catalog" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.path }));
vi.mock("@/cart/cart-context", () => ({ useCart: () => ({ lineCount: 2, hydrated: true }) }));

describe("customer branding", () => {
  it("links the logo home and reserves its intrinsic aspect ratio", () => {
    route.path = "/catalog";
    const html = renderToStaticMarkup(<SiteHeader />);
    expect(html).toContain('class="site-logo"');
    expect(html).toContain('href="/"');
    expect(html).toContain('alt="Dushanbe Fresh"');
    expect(html).toContain('width="1200" height="233"');
    expect(html).toContain("dushanbe-fresh-logo.png");
    expect(html).not.toContain("theme-switcher");
    expect(html).toContain("Корзина, позиций: 2");
  });
  it("does not replace the staff header", () => {
    route.path = "/admin";
    expect(renderToStaticMarkup(<SiteHeader />)).toBe("");
  });
});
