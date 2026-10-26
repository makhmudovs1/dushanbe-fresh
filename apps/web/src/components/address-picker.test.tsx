import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AddressPicker } from "./address-picker";
import { emptyAddress } from "@/lib/delivery-address";
import { LanguageProvider } from "@/i18n/provider";

const props = { initial: emptyAddress, addresses: [], busy: false, error: "", onClose: () => {}, onSave: () => {}, onSelect: () => {}, onDelete: () => {} };
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ refresh: vi.fn() }) }));
describe("unified address picker", () => {
  it("puts one search, centered-pin map and one primary command on the same surface", () => {
    const html = renderToStaticMarkup(<AddressPicker {...props} />);
    expect(html).toContain('role="combobox"');
    expect(html).toContain('class="address-center-pin"');
    expect(html).toContain('data-testid="address-continue"');
    expect(html).not.toMatch(/Выбрать центр карты|Поиск по городу подключён|Использовать этот адрес|address-map-confirm/);
    expect(html.match(/class="primary-action"/g)).toHaveLength(1);
  });
  it("shows a compact editable private-house form with labels and no apartment fields", () => {
    const value = { ...emptyAddress, id: "home", label: "home" as const, isDefault: true, housingType: "house" as const, street: "Рудаки", building: "15", latitude: 38.56, longitude: 68.77 };
    const html = renderToStaticMarkup(<AddressPicker {...props} initial={value} addresses={[value]} initialEditingId="home" />);
    expect(html).toContain("Сохранить адрес");
    expect(html).toContain("Ориентир и комментарий курьеру");
    expect(html).not.toContain("Номер квартиры");
    expect(html).toContain("Работа"); expect(html).toContain("Другое");
  });
  it("renders saved addresses as selectable rows with independent edit controls", () => {
    const value = { ...emptyAddress, id: "work", label: "work" as const, isDefault: false, street: "Сомони", building: "20" };
    const html = renderToStaticMarkup(<AddressPicker {...props} addresses={[value]} />);
    expect(html).toContain("Добавить новый адрес");
    expect(html).toContain("Изменить адрес: Сомони, 20");
    expect(html).not.toContain('role="combobox"');
  });
  it("localizes the new picker to Tajik", () => {
    const html = renderToStaticMarkup(<LanguageProvider initialLocale="tg"><AddressPicker {...props} /></LanguageProvider>);
    expect(html).toContain("Ба куҷо расонем?"); expect(html).toContain("Кӯча ва рақами хона");
    expect(html).not.toContain("Куда доставить?");
  });
});
