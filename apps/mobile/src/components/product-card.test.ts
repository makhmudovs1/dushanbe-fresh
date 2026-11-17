// Component interaction checks with host adapters. This is NOT a native layout renderer.
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createElement } from "react";
import { Pressable, Text } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { potato } from "../domain/fixtures.test-support";
import { reduceCart as cartReducer } from "../domain/cart";
import { translate } from "../i18n";
const h = vi.hoisted(() => ({
  quantity: undefined as string | undefined,
  hydrated: true,
  account: false,
  legacy: false,
  dispatch: vi.fn(),
  push: vi.fn(),
  navigate: vi.fn(),
  mutate: vi.fn(),
  active: false,
  locale: "ru" as "ru" | "tg",
}));
vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  FlatList: "FlatList",
  ActivityIndicator: "ActivityIndicator",
  TextInput: "TextInput",
  StyleSheet: { create: (v: unknown) => v },
  Alert: { alert: vi.fn() },
}));
vi.mock("expo-image", () => ({ Image: "Image" }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("./store-header", () => ({ StoreHeader: () => null }));
vi.mock("./mobile-navigation", () => ({ MobileNavigation: () => null }));
vi.mock("expo-router", () => ({
  router: { push: h.push, navigate: h.navigate },
}));
vi.mock("../design/native-icon", () => ({ makeIcon: () => () => null }));
vi.mock("../state/session", () => ({
  useSession: () => ({ phase: h.account ? "account" : "guest" }),
}));
vi.mock("../state/favorites", () => ({
  useFavorites: () => ({ data: { ids: h.active ? [potato.id] : [] } }),
  useFavoriteMutation: () => ({ isPending: false, mutate: h.mutate }),
}));
vi.mock("../api/config", () => ({
  api: { baseUrl: "https://dushanbefresh.tj/api/v1" },
  assetBaseUrl: "https://dushanbefresh.tj",
}));
vi.mock("../state/app-state", () => ({
  useApp: () => ({
    t: (x: string) => translate(h.locale, x),
    locale: h.locale,
  }),
  useCart: () => ({
    hydrated: h.hydrated,
    items: h.quantity
      ? [
          {
            product: potato,
            quantity: h.quantity,
            serverSnapshot: h.legacy
              ? { qualityOptionId: "legacy" }
              : undefined,
          },
        ]
      : [],
    dispatch: h.dispatch,
  }),
}));
import {
  FavoriteButton,
  ProductCard,
  ProductPrice,
  Quantity,
} from "./product-card";
import { ScreenFrame } from "./screen-frame";
let rendered: ReactTestRenderer | undefined;
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
function mount(element: ReturnType<typeof createElement>) {
  act(() => {
    rendered = create(element);
  });
  return rendered!.root;
}
afterEach(() => {
  if (rendered) act(() => rendered?.unmount());
  rendered = undefined;
});
beforeEach(() => {
  vi.clearAllMocks();
  h.quantity = undefined;
  h.hydrated = true;
  h.account = false;
  h.legacy = false;
  h.active = false;
  h.locale = "ru";
});
it("updates shared screen titles when the user switches RU/TJ", () => {
  const element = () =>
    createElement(ScreenFrame, {
      title: "Настройки профиля",
      active: "profile",
      children: null,
    });
  const root = mount(element());
  const titles = () =>
    root.findAllByType(Text).map((node) => node.props.children);
  expect(titles()).toContain("Настройки профиля");
  h.locale = "tg";
  act(() => rendered!.update(element()));
  expect(titles()).toContain("Танзимоти профил");
  expect(titles()).not.toContain("Настройки профиля");
  h.locale = "ru";
  act(() => rendered!.update(element()));
  expect(titles()).toContain("Настройки профиля");
});
describe("WEB purchase controls in native components", () => {
  it("renders a circle plus over the card, and the price before the name", () => {
    const root = mount(
      createElement(ProductCard, { product: potato, width: 174 }),
    );
    const json = JSON.stringify(rendered!.toJSON());
    expect(json.indexOf("6,9")).toBeLessThan(
      json.indexOf('"Картофель белый"', json.indexOf("6,9")),
    );
    expect(
      root
        .findAllByType(Pressable)
        .some(
          (p) =>
            p.props.accessibilityLabel ===
            "Добавить в корзину: Картофель белый",
        ),
    ).toBe(true);
    expect(root.findAllByType(FavoriteButton)).toHaveLength(0);
  });
  it("adds the server minimum of 0.5 kg and never uses an assumed 1 kg", () => {
    const root = mount(
      createElement(Quantity, { product: potato, variant: "card" }),
    );
    act(() => root.findByType(Pressable).props.onPress());
    const event = h.dispatch.mock.calls[0]![0];
    expect(event).toMatchObject({
      type: "change",
      direction: 1,
      product: potato,
    });
    expect(cartReducer([], event)[0]?.quantity).toBe("0.5");
  });
  it("increments by the server half-kilogram step", () => {
    h.quantity = "0.5";
    const root = mount(
      createElement(Quantity, { product: potato, variant: "card" }),
    );
    const plus = root
      .findAllByType(Pressable)
      .find((p) => p.props.accessibilityLabel.startsWith("Увеличить"))!;
    act(() => plus.props.onPress());
    expect(
      cartReducer(
        [{ product: potato, quantity: "0.5" }],
        h.dispatch.mock.calls[0]![0],
      )[0]?.quantity,
    ).toBe("1");
  });
  it("keeps cart minus disabled at the minimum; card minus removes the line", () => {
    h.quantity = "0.5";
    const root = mount(
      createElement(Quantity, { product: potato, variant: "cart" }),
    );
    expect(root.findAllByType(Pressable)[0]?.props.disabled).toBe(true);
    act(() =>
      rendered!.update(
        createElement(Quantity, { product: potato, variant: "card" }),
      ),
    );
    const minus = rendered!.root.findAllByType(Pressable)[0]!;
    expect(minus.props.disabled).toBe(false);
    act(() => minus.props.onPress());
    expect(
      cartReducer(
        [{ product: potato, quantity: "0.5" }],
        h.dispatch.mock.calls[0]![0],
      ),
    ).toEqual([]);
  });
  it("disables buying while guest storage is restoring", () => {
    h.hydrated = false;
    const root = mount(
      createElement(Quantity, { product: potato, variant: "card" }),
    );
    expect(root.findByType(Pressable).props.disabled).toBe(true);
    expect(h.dispatch).not.toHaveBeenCalled();
  });
  it("does not silently add to server favorites for a guest", () => {
    const root = mount(createElement(FavoriteButton, { productId: potato.id }));
    act(() => root.findByType(Pressable).props.onPress());
    expect(h.push).toHaveBeenCalledWith({
      pathname: "/login",
      params: { favoriteId: potato.id },
    });
    expect(h.mutate).not.toHaveBeenCalled();
  });
  it("toggles a verified account favorite", () => {
    h.account = true;
    const root = mount(createElement(FavoriteButton, { productId: potato.id }));
    act(() => root.findByType(Pressable).props.onPress());
    expect(h.mutate).toHaveBeenCalledWith(
      { id: potato.id, active: true },
      expect.any(Object),
    );
    expect(h.push).not.toHaveBeenCalled();
  });
  it("shows server discounts, with no manufactured previous price", () => {
    mount(createElement(ProductPrice, { product: potato }));
    expect(JSON.stringify(rendered!.toJSON())).not.toContain("line-through");
    act(() =>
      rendered!.update(
        createElement(ProductPrice, {
          product: {
            ...potato,
            priceDrop: { oldPrice: "10.00", discountPercent: 31 },
          },
        }),
      ),
    );
    expect(
      rendered!.root
        .findAllByType(Text)
        .some((n) => n.children.join("") === "−31%"),
    ).toBe(true);
    expect(JSON.stringify(rendered!.toJSON())).toContain("line-through");
  });
  it("routes legacy quantities to cart review instead of buying", () => {
    h.quantity = "1";
    h.legacy = true;
    const root = mount(
      createElement(Quantity, { product: potato, variant: "card" }),
    );
    act(() => root.findByType(Pressable).props.onPress());
    expect(h.navigate).toHaveBeenCalledWith("/(tabs)/cart");
    expect(h.dispatch).not.toHaveBeenCalled();
  });
});
