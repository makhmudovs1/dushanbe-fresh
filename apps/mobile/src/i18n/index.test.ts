import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  localizedDescription,
  localizedName,
  serverMessage,
  slotLabel,
  translate,
  unitLabel,
} from ".";
import { tajik } from "./web-messages";
import { potato } from "../domain/fixtures.test-support";
function sources(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(join(path, entry.name))
      : /\.tsx$/.test(entry.name)
        ? [readFileSync(join(path, entry.name), "utf8")]
        : [],
  );
}
describe("RU/TJ", () => {
  it("keeps existing WEB translations authoritative", () => {
    for (const [key, value] of Object.entries(tajik))
      expect(translate("tg", key)).toBe(value);
  });
  it("uses the bilingual catalog fields", () => {
    expect(localizedName("tg", potato)).toBe("Картошкаи сафед");
    expect(localizedDescription("tg", potato)).toBe("Тавсиф");
    expect(localizedName("ru", potato)).toBe("Картофель белый");
    expect(localizedName("tg", { name: "Имя" })).toBe("Имя");
  });
  it("uses Dushanbe time regardless of device timezone", () => {
    expect(
      slotLabel("ru", {
        startsAt: "2026-10-26T05:00:00.000Z",
        endsAt: "2026-10-26T07:00:00.000Z",
      }),
    ).toContain("10:00–12:00");
  });
  it("accepts the actual API wall-time slot contract", () => {
    const label = slotLabel("ru", {
      date: "2099-01-01",
      startsAt: "10:00",
      endsAt: "12:00",
    });
    expect(label).toContain("10:00–12:00");
    expect(label).toContain("1");
  });
  it("translates navigation and quantity units", () => {
    expect(translate("tg", "Главная")).toBe("Асосӣ");
    expect(unitLabel("tg", "piece")).toBe("дона");
    expect(unitLabel("ru", "piece")).toBe("шт.");
  });
  it("localizes dynamic checkout errors without mixing product names", () => {
    expect(
      serverMessage("tg", "Картофель белый сегодня больше недоступны.", potato),
    ).toContain("Картошкаи сафед");
    expect(
      serverMessage("tg", "До минимального заказа не хватает 20.00 сомони."),
    ).toContain("20.00");
    expect(serverMessage("tg", "Unknown server error")).not.toContain(
      "Unknown",
    );
    expect(serverMessage("ru", "Ошибка")).toBe("Ошибка");
  });
  it("has Tajik translations for static interface strings", () => {
    const base = fileURLToPath(new URL("../../", import.meta.url));
    const strings = [
      ...sources(join(base, "app")),
      ...sources(join(base, "src")),
    ].flatMap((source) =>
      [...source.matchAll(/\bt\(\s*"([^"\n]+)"\s*,?\s*\)/g)].map((m) => m[1]!),
    );
    const missing = [...new Set(strings)].filter(
      (text) =>
        translate("tg", text) === text &&
        tajik[text] !== text &&
        text !== "Домофон",
    );
    expect(missing).toEqual([]);
  });
});
