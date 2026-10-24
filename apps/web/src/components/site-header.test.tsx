import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "./site-header";

const route = vi.hoisted(() => ({ path: "/catalog" }));
const auth = vi.hoisted(() => ({ status: { enabled: false }, user: null as { id: string } | null }));
vi.mock("next/navigation", () => ({ usePathname: () => route.path, useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/cart/cart-context", () => ({ useCart: () => ({ lineCount: 2, hydrated: true }) }));
vi.mock("@/customer/customer-context", () => ({ useCustomer: () => auth }));

describe("customer branding", () => {
  beforeEach(() => { route.path = "/catalog"; auth.user = null; });
  it("keeps accessible icon-only account entry for guests and signed-in customers", () => {
    const guest = renderToStaticMarkup(<SiteHeader />);
    expect(guest).toContain('aria-label="Войти"');
    expect(guest).not.toContain("<span>Войти</span>");
    auth.user = { id: "customer" };
    const account = renderToStaticMarkup(<SiteHeader />);
    expect(account).toContain('aria-label="Профиль"');
    expect(account).not.toContain("<span>Профиль</span>");
  });
  it("uses the supplied full wordmark and keeps language, cart and profile in order", () => {
    route.path = "/catalog";
    const html = renderToStaticMarkup(<SiteHeader />);
    expect(html).toContain('class="site-logo brand-logo"');
    expect(html).toContain('href="/"');
    expect(html).toContain('width="600" height="210"');
    expect(html).toContain("wordmark-v3.webp");
    expect(html).not.toContain("brand-logo__wordmark");
    expect(html.indexOf('class="language-switcher')).toBeLessThan(html.indexOf('class="cart-link"'));
    expect(html.indexOf('class="cart-link"')).toBeLessThan(html.indexOf('class="header-account"'));
    expect(html).not.toContain('href="/favorites"');
    expect(html).not.toContain("theme-switcher");
    expect(html).toContain("Корзина, позиций: 2");
  });
  it("does not replace the staff header", () => {
    route.path = "/admin";
    expect(renderToStaticMarkup(<SiteHeader />)).toBe("");
  });
});
