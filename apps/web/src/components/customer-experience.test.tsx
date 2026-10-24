import { renderToStaticMarkup } from "react-dom/server";
import type { CustomerProfile } from "@dushanbe-fresh/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerAccount } from "./customer-account";
import { CustomerLogin } from "./customer-login";
import { MobileNavigation } from "./mobile-navigation";
import { AddressFields, emptyAddress } from "./address-fields";
import { LanguageProvider } from "@/i18n/provider";

const session = vi.hoisted(() => ({ user: null as CustomerProfile | null, loading: false, status: { enabled: false, requiredForCheckout: false }, login: vi.fn(), refresh: vi.fn(), logout: vi.fn() }));
vi.mock("@/customer/customer-context", () => ({ useCustomer: () => session }));
vi.mock("@/customer/delivery-address-context", () => ({ useDeliveryAddress: () => null }));
vi.mock("@/cart/cart-context", () => ({ useCart: () => ({ state: { items: [] }, lineCount: 0, hydrated: true }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/account", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./use-mobile-viewport", () => ({ useMobileViewport: () => true }));

describe("customer experience surfaces", () => {
  beforeEach(() => { session.user = null; session.status.enabled = false; });
  it("keeps a visible entry and honest guest fallback without an SMS provider", () => {
    const profile = renderToStaticMarkup(<CustomerAccount />);
    expect(profile).toContain("Войдите в аккаунт");
    expect(profile).toContain("Войти");
    expect(profile).toContain(encodeURIComponent("/storefront/v2/fruits.webp"));
    expect(profile).toContain("Вход по SMS пока недоступен");
    expect(profile).not.toMatch(/поддержку|Промокоды|Бонусы|предпочтения/);
    const login = renderToStaticMarkup(<CustomerLogin available={false} onClose={() => {}} onSuccess={() => {}} />);
    expect(login).toContain("Продолжить покупки");
    expect(login).not.toContain('type="tel"');
    expect(login).not.toContain("Код отправлен");
  });
  it("does not ask an unverified visitor for a name or reveal whether the phone exists", () => {
    const html = renderToStaticMarkup(<CustomerLogin onClose={() => {}} onSuccess={() => {}} />);
    expect(html).toContain('value="+992"');
    expect(html).toContain("Получить код");
    expect(html).not.toContain('autoComplete="name"');
    expect(html).not.toContain("Код отправлен");
  });
  it("shows only real account sections and a fifth icon-only profile navigation link", () => {
    session.user = { id: "owner", name: "Тест Пользователь", phone: "+992900000001", phoneVerifiedAt: new Date(0).toISOString() };
    const html = renderToStaticMarkup(<CustomerAccount />);
    for (const label of ["Тест Пользователь", "+992900000001", "Избранное", "История заказов", "Адреса доставки", "Настройки профиля", "Выйти из аккаунта"]) expect(html).toContain(label);
    expect(html).not.toMatch(/Промокоды|Бонусы|подписк|Мои предпочтения/);
    const nav = renderToStaticMarkup(<MobileNavigation />);
    expect(nav).toMatch(/<a[^>]*aria-label="Профиль"[^>]*href="\/account"/);
    expect(nav.indexOf('href="/account"')).toBeGreaterThan(nav.indexOf('href="/cart"'));
    expect(nav).not.toContain(">Профиль<");
  });
  it("separates street and optional apartment details including intercom", () => {
    const street = renderToStaticMarkup(<AddressFields value={emptyAddress} onChange={() => {}} fields="street" />);
    expect(street).toContain("Улица");
    expect(street).not.toContain("Домофон");
    const details = renderToStaticMarkup(<AddressFields value={{ ...emptyAddress, intercom: "15B" }} onChange={() => {}} fields="details" />);
    expect(details).toContain("Домофон");
    expect(details).toContain('value="15B"');
    expect(details).not.toContain("Улица");
    const house = renderToStaticMarkup(<AddressFields value={{ ...emptyAddress, housingType: "house" }} onChange={() => {}} fields="details" />);
    expect(house).not.toContain("Подъезд");
  });
  it("localizes the guest profile to Tajik", () => {
    const html = renderToStaticMarkup(<LanguageProvider initialLocale="tg"><CustomerAccount /></LanguageProvider>);
    expect(html).toContain("Ба ҳисоб ворид шавед");
    expect(html).not.toContain("Войдите в аккаунт");
    expect(html).not.toContain("Вход по SMS пока недоступен");
  });
});
