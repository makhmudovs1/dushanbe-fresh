import { afterEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { serverI18n } from "./server";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
afterEach(() => vi.resetAllMocks());

describe("asynchronous server locale", () => {
  it.each([["ru", "Каталог"], ["tg", "Каталог"]])("awaits the %s cookie store", async locale => {
    const get = vi.fn(() => ({ value: locale }));
    vi.mocked(cookies).mockResolvedValue({ get } as unknown as Awaited<ReturnType<typeof cookies>>);
    expect((await serverI18n()).locale).toBe(locale);
    expect(get).toHaveBeenCalledWith("df-language");
  });

  it("retains the default locale when the cookie is absent", async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => undefined } as unknown as Awaited<ReturnType<typeof cookies>>);
    const { locale, t } = await serverI18n();
    expect(locale).toBe("ru");
    expect(t("Главная")).toBe("Главная");
  });
});
