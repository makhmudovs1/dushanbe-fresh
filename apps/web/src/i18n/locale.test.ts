import { describe, expect, it } from "vitest";
import { localizedName, parseLocale, translate } from "./locale";
import { priceLabel, quantityLabel, unitLabel } from "@/lib/format";
import { slotLabel } from "@/lib/checkout";

describe("RU/TJ localization", () => {
  it("defaults to Russian and only accepts the Tajik ISO language code", () => {
    expect(parseLocale()).toBe("ru"); expect(parseLocale("en")).toBe("ru"); expect(parseLocale("tg")).toBe("tg");
  });
  it("prefers JSON translations without overwriting the compatible Russian field", () => {
    const item = { name: "Бананы — до ~20 см", nameTj: "Банан — то ~20 см" };
    expect(localizedName("tg", item)).toBe(item.nameTj); expect(localizedName("ru", item)).toBe(item.name);
    expect(localizedName("tg", { name: "Петрушка" })).toBe("Ҷаъфарӣ");
  });
  it("formats units, currency and delivery dates without numeric price calculations", () => {
    expect(quantityLabel("2", "bunch", "tg")).toBe("2 баста");
    expect(unitLabel("piece", "1", "tg")).toBe("дона");
    expect(priceLabel("2.50", "bunch", "tg")).toBe("2,5 сомонӣ / баста");
    expect(slotLabel({ date: "2026-10-12", startsAt: "10:00", endsAt: "12:00" }, "tg")).toBe("12 октябр, 10:00–12:00");
  });
  it("translates server validation messages while preserving decimal amounts", () => {
    expect(translate("tg", "До минимального заказа не хватает 25.50 сомони.")).toBe("То фармоиши ҳадди ақал 25.50 сомонӣ намерасад.");
    expect(translate("tg", "Проверьте количество: минимум 0.5, шаг 0.25.")).toContain("0.5, қадам 0.25");
    expect(translate("tg", "Мест больше нет")).toBe("Ҷой намондааст");
    expect(translate("tg", "Заказ принят")).toBe("Фармоиш қабул шуд");
  });
  it("translates new account, address and cart recovery actions", () => {
    for (const text of ["Повторить", "Изменить", "Указать адрес", "Сохраняем...", "Товар не найден.", "Войдите в аккаунт", "Оставить позицию аккаунта", "Удалить обе позиции", "В аккаунте", "На этом устройстве"]) {
      expect(translate("tg", text)).not.toBe(text);
      expect(translate("ru", text)).toBe(text);
    }
  });
});
