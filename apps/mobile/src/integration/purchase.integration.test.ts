import { slotLabel } from "../i18n";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {
  CheckoutInput,
  CheckoutQuote,
  CreateOrderInput,
  OrderReceipt,
  PublicOrderDto,
  MobileSessionDto,
  MobileCartSnapshot,
  CustomerProfile,
  SavedAddress,
  AdminOrder,
  AdminWave,
} from "@dushanbe-fresh/shared";
import { ApiClient, ApiError } from "../api/client";
import { OrderSubmission, type PendingOrder } from "../domain/checkout";
import { SessionManager, type SecretStore } from "../state/session-manager";
import { AccountCartStore } from "../state/account-cart-store";
import { nativeLine, serverLine } from "../domain/account-cart";
import { parseProducts } from "../domain/catalog";
const configPath = process.env.MOBILE_TEST_RUNTIME_CONFIG;
describe.skipIf(!configPath)(
  "native domain clients against isolated real HTTP API/PostgreSQL",
  () => {
    let config: {
      base: string;
      gatewayUrl: string;
      secret: string;
      runtimeId: string;
      productId: string;
      secondProductId: string;
      slotId: string;
      operationsSlotId: string;
      categoryId: string;
      staff: Record<"admin" | "picker" | "courier", { id: string; email: string; password: string }>;
    };
    let api: ApiClient;
    const address = {
      street: "Тестовая улица",
      building: "10",
      apartment: "",
      entrance: "",
      floor: "",
      instructions: "",
      latitude: 38.55,
      longitude: 68.75,
    };
    async function control(action: string, trackingToken?: string) {
      const response = await fetch(`${config.gatewayUrl}/control`, {
        method: "POST",
        headers: { "X-Mobile-Test-Secret": config.secret },
        body: JSON.stringify({ action, trackingToken }),
      });
      expect(response.ok).toBe(true);
      return response.json();
    }
    const input = (): CheckoutInput => ({
      items: [
        {
          productId: config.productId,
          quantity: "1",
          qualityOptionId: null,
          observedPrice: "10",
        },
      ],
      deliverySlotId: config.slotId,
      address,
    });
    async function quote(value = input()) {
      return api.request<CheckoutQuote>("/checkout/validate", {
        method: "POST",
        body: value,
      });
    }
    const order = (q: CheckoutQuote, value = input()): CreateOrderInput => ({
      ...value,
      address,
      name: "Локальный тест",
      phone: "+992000000010",
      substitutionPolicy: "contact_me",
      reviewToken: q.reviewToken,
      requestId: randomUUID(),
    });
    beforeAll(async () => {
      config = JSON.parse(readFileSync(configPath!, "utf8"));
      if (!["localhost", "127.0.0.1"].includes(new URL(config.base).hostname))
        throw new Error("Loopback-only runtime required");
      api = new ApiClient(config.base);
      const proof = await api.request<{ isolated: boolean; runtimeId: string }>(
        "/mobile-test/runtime",
      );
      if (!proof.isolated || proof.runtimeId !== config.runtimeId)
        throw new Error("Dedicated test runtime proof required");
    });
    beforeEach(async () => { await control("reset"); await control("optional-login"); });
    it("creates and tracks an actual guest order with two separate varieties", async () => {
      const value = {
        ...input(),
        items: [
          {
            productId: config.productId,
            quantity: "0.5",
            qualityOptionId: null,
          },
          {
            productId: config.secondProductId,
            quantity: "0.5",
            qualityOptionId: null,
          },
        ],
      };
      const q = await quote(value);
      expect(q.valid).toBe(true);
      expect(slotLabel("ru", q.deliverySlot!)).toContain("10:00–12:00");
      expect(q.itemsSubtotal).toBe("11.00");
      expect(q.totalEstimated).toBe("18.00");
      const receipt = await api.request<OrderReceipt>("/checkout/orders", {
        method: "POST",
        body: order(q, value),
      });
      const tracked = await api.request<PublicOrderDto>(
        `/public/orders/${receipt.publicTrackingToken}`,
      );
      expect(tracked.items).toHaveLength(2);
      expect(tracked.money.payable).toBe("18.00");
      expect(tracked.address.street).toBe(address.street);
      expect(
        await control("inspect-order", receipt.publicTrackingToken),
      ).toMatchObject({
        exists: true,
        totalEstimated: "18.00",
        accountOwned: false,
      });
      await control("advance-order", receipt.publicTrackingToken);
      const updated = await api.request<PublicOrderDto>(
        `/public/orders/${receipt.publicTrackingToken}`,
      );
      expect(updated.status).toBe("preparing");
    });
    it("returns the same order for concurrent repeated request IDs", async () => {
      const q = await quote();
      const value = order(q);
      const [a, b] = await Promise.all(
        [0, 1].map(() =>
          api.request<OrderReceipt>("/checkout/orders", {
            method: "POST",
            body: value,
          }),
        ),
      );
      expect(a!.orderNumber).toBe(b!.orderNumber);
    });
    it("recovers an actually committed order after its response is lost and the client restarts", async () => {
      const q = await quote();
      let pending: PendingOrder | null = null;
      const journal = {
        read: async () => pending,
        write: async (value: PendingOrder) => {
          pending = value;
        },
        remove: async () => {
          pending = null;
        },
      };
      let first = true;
      const send = async (value: CreateOrderInput) => {
        const receipt = await api.request<OrderReceipt>("/checkout/orders", {
          method: "POST",
          body: value,
        });
        if (first) {
          first = false;
          throw new ApiError("network");
        }
        return receipt;
      };
      const scope = { apiBaseUrl: config.base, ownerId: null };
      const payload = order(q);
      await expect(
        new OrderSubmission(journal, send, scope).submit(payload),
      ).rejects.toMatchObject({ code: "network" });
      const receipt = await new OrderSubmission(journal, send, scope).submit();
      const repeated = await api.request<OrderReceipt>("/checkout/orders", {
        method: "POST",
        body: payload,
      });
      expect(receipt.orderNumber).toBe(repeated.orderNumber);
      expect(pending).not.toBeNull();
    });
    it("requires new review after a real price change", async () => {
      const q = await quote();
      await control("price");
      await expect(
        api.request("/checkout/orders", { method: "POST", body: order(q) }),
      ).rejects.toMatchObject({ status: 409 });
      const next = await quote();
      expect(next.itemsSubtotal).toBe("11.00");
      expect(next.reviewToken === q.reviewToken).toBe(false);
    });
    it("rejects unavailable products and nonconforming quantity steps", async () => {
      await control("unavailable");
      expect((await quote()).valid).toBe(false);
      await control("reset");
      const value = {
        ...input(),
        items: [
          {
            productId: config.productId,
            quantity: "0.7",
            qualityOptionId: null,
          },
        ],
      };
      expect((await quote(value)).valid).toBe(false);
    });
    it("rejects closed delivery windows and an address outside the active polygon", async () => {
      await control("slot");
      expect((await quote()).valid).toBe(false);
      await control("reset");
      await control("zone");
      expect(
        (
          await quote({
            ...input(),
            address: { ...address, latitude: 39, longitude: 69 },
          })
        ).valid,
      ).toBe(false);
      expect((await quote()).valid).toBe(true);
    });
    it("rejects invalid contact data, altered review and missing required address fields", async () => {
      const q = await quote();
      await expect(
        api.request("/checkout/orders", {
          method: "POST",
          body: { ...order(q), phone: "invalid" },
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        api.request("/checkout/orders", {
          method: "POST",
          body: { ...order(q), reviewToken: "f".repeat(64) },
        }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        api.request("/checkout/orders", {
          method: "POST",
          body: { ...order(q), address: { ...address, building: "" } },
        }),
      ).rejects.toMatchObject({ status: 400 });
    });
    it("logs in through the isolated SMS gateway, imports a guest cart, creates an owned order and denies foreign history", async () => {
      const values = new Map<string, string>();
      const storage: SecretStore = {
        getItem: async (k) => values.get(k) ?? null,
        setItem: async (k, v) => {
          values.set(k, v);
        },
        removeItem: async (k) => {
          values.delete(k);
        },
      };
      const manager = new SessionManager(storage, api);
      const phone = `+9928${String(Date.now()).slice(-6)}01`;
      await api.request("/mobile/auth/code", {
        method: "POST",
        body: { phone },
      });
      const message = (await (
        await fetch(`${config.gatewayUrl}/challenge`, {
          method: "POST",
          headers: { "X-Mobile-Test-Secret": config.secret },
          body: JSON.stringify({ phone }),
        })
      ).json()) as { challengeId: string; code: string };
      const user = await manager.login(message.challengeId, message.code);
      expect(user.phone).toBe(phone);
      await manager.updateName("Локальный клиент", user.id);
      const products = parseProducts(await api.request("/products"));
      const product = products.find((p) => p.id === config.productId)!;
      let guest = [serverLine({ product, quantity: "1" })];
      const cart = new AccountCartStore(
        user.id,
        storage,
        (path, options) =>
          manager.request(path, { ...options, ownerId: user.id }),
        randomUUID,
        () => guest,
        async () => {
          guest = [];
        },
      );
      await cart.initialize();
      expect(cart.getSnapshot().items).toHaveLength(1);
      expect(guest).toHaveLength(0);
      expect(nativeLine(cart.getSnapshot().items[0]!).quantity).toBe("1");
      const q = await quote();
      const receipt = await manager.request<OrderReceipt>(
        "/mobile/checkout/orders",
        {
          method: "POST",
          body: { ...order(q), phone: "+992000000011" },
          ownerId: user.id,
        },
      );
      const history = await manager.request<
        { id: string; orderNumber: string }[]
      >("/mobile/customer/orders", { ownerId: user.id });
      expect(history.some((o) => o.orderNumber === receipt.orderNumber)).toBe(
        true,
      );
      const owned = history.find((o) => o.orderNumber === receipt.orderNumber)!;
      expect(
        await control("inspect-order", receipt.publicTrackingToken),
      ).toMatchObject({ exists: true, accountOwned: true });
      await control("advance-order", receipt.publicTrackingToken);
      const updatedOwned = await manager.request<PublicOrderDto>(
        `/mobile/customer/orders/${owned.id}`,
        { ownerId: user.id },
      );
      expect(updatedOwned.status).toBe("preparing");
      expect(updatedOwned.money.payable).toBe(q.totalEstimated);
      expect(
        (
          await manager.request<PublicOrderDto>(
            `/mobile/customer/orders/${owned.id}`,
            { ownerId: user.id },
          )
        ).orderNumber,
      ).toBe(receipt.orderNumber);
      const repeatedOrder = await manager.request<{
        items: {
          product: { id: string; sellingPrice: string };
          quantity: string;
        }[];
      }>(`/mobile/customer/orders/${owned.id}/repeat`, {
        method: "POST",
        body: {},
        ownerId: user.id,
      });
      expect(repeatedOrder.items[0]?.product.id).toBe(config.productId);
      expect(repeatedOrder.items[0]?.product.sellingPrice).toBe("10");
      const otherPhone = `+9928${String(Date.now()).slice(-6)}02`;
      await api.request("/mobile/auth/code", {
        method: "POST",
        body: { phone: otherPhone },
      });
      const otherMessage = await (
        await fetch(`${config.gatewayUrl}/challenge`, {
          method: "POST",
          headers: { "X-Mobile-Test-Secret": config.secret },
          body: JSON.stringify({ phone: otherPhone }),
        })
      ).json();
      const other = await api.request<MobileSessionDto>("/mobile/auth/verify", {
        method: "POST",
        body: otherMessage,
      });
      await expect(
        api.request(`/mobile/customer/orders/${owned.id}`, {
          accessToken: other.accessToken,
        }),
      ).rejects.toMatchObject({ status: 404 });
      cart.dispose();
      await manager.logout(user.id);
    });
    it("requires verified identity and completes shared WEB/native shopping, picker and courier HTTP lifecycle", async () => {
      await control("require-login");
      const q = await quote();
      await expect(api.request("/checkout/orders", { method: "POST", body: order(q) })).rejects.toMatchObject({ status: 401 });
      await expect(api.request("/mobile/checkout/orders", { method: "POST", body: order(q) })).rejects.toMatchObject({ status: 401 });
      const origin = "http://127.0.0.1:3146";
      async function web<T>(path: string, method = "GET", body?: unknown, cookie?: string): Promise<{ value: T; cookie: string | null }> {
        const response = await fetch(`${config.base}${path}`, { method, headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
        expect(response.ok, `${method} ${path}: ${response.status}`).toBe(true);
        return { value: await response.json() as T, cookie: response.headers.get("set-cookie")?.split(";")[0] ?? null };
      }
      const roles = ["admin", "picker", "courier"] as const;
      const tokens = {} as Record<typeof roles[number], string>;
      for (const role of roles) tokens[role] = (await web<{ accessToken: string }>("/auth/admin/login", "POST", config.staff[role])).value.accessToken;
      const ops = <T>(role: typeof roles[number], path: string, method: "GET" | "POST" | "PATCH" = "GET", body?: unknown) => api.request<T>(`/admin${path}`, { method, body, accessToken: tokens[role] });
      const created = await ops<{ id: string; slug: string }>("admin", "/products", "POST", { categoryId: config.categoryId, slug: `native-e2e-${randomUUID()}`, name: "Тестовый продукт из админки", nameTj: "Маҳсулоти санҷишӣ", unit: "kg", priceMode: "manual", purchasePrice: "8", sellingPrice: "10", minQuantity: "0.5", quantityStep: "0.5", isWeighted: true, isActive: true, isAvailableToday: true });
      const product = parseProducts(await api.request("/products")).find(p => p.id === created.id)!;
      expect(product.sellingPrice).toBe("10");
      expect((await web<{ id: string; sellingPrice: string }>(`/products/${created.slug}`)).value).toMatchObject({ id: created.id, sellingPrice: "10" });
      await ops("admin", `/products/${created.id}`, "PATCH", { sellingPrice: "11" });
      const updated = parseProducts(await api.request("/products")).find(p => p.id === created.id)!;
      expect(updated.sellingPrice).toBe("11");
      expect((await web<{ sellingPrice: string }>(`/products/${created.slug}`)).value.sellingPrice).toBe("11");
      const phone = `+9928${String(Date.now()).slice(-6)}03`;
      await web("/customer-auth/code", "POST", { phone });
      const challenge = async () => (await fetch(`${config.gatewayUrl}/challenge`, { method: "POST", headers: { "X-Mobile-Test-Secret": config.secret }, body: JSON.stringify({ phone }) })).json();
      const browserLogin = await web<CustomerProfile>("/customer-auth/verify", "POST", await challenge());
      const cookie = browserLogin.cookie!;
      await web("/customer/profile", "PATCH", { firstName: "Клиент", lastName: "Санҷиш" }, cookie);
      // Advance only the consumed fixture challenge clock; production resend limits stay unchanged.
      await control("elapsed-sms-cooldown");
      await api.request("/mobile/auth/code", { method: "POST", body: { phone } });
      const native = await api.request<MobileSessionDto>("/mobile/auth/verify", { method: "POST", body: await challenge() });
      expect(native.user.id).toBe(browserLogin.value.id);
      expect(native.user.name).toBe("Клиент Санҷиш");
      const mobile = <T>(path: string, method: "GET" | "POST" | "PUT" | "PATCH" = "GET", body?: unknown) => api.request<T>(`/mobile${path}`, { method, body, accessToken: native.accessToken });
      const empty = (await web<MobileCartSnapshot>("/customer/cart", "GET", undefined, cookie)).value;
      await web("/customer/cart", "PUT", { revision: empty.revision, items: [serverLine({ product: updated, quantity: "1" })] }, cookie);
      const shared = await mobile<MobileCartSnapshot>("/customer/cart");
      expect(shared.items[0]?.productId).toBe(created.id);
      await mobile("/customer/cart", "PUT", { revision: shared.revision, items: [serverLine({ product: updated, quantity: "1.5" })] });
      expect((await web<MobileCartSnapshot>("/customer/cart", "GET", undefined, cookie)).value.items[0]?.quantity).toBe("1.5");
      await mobile("/customer/favorites/" + created.id, "PUT", { active: true });
      expect(JSON.stringify((await web("/customer/favorites", "GET", undefined, cookie)).value)).toContain(created.id);
      const addresses = await mobile<SavedAddress[]>("/customer/addresses", "POST", { ...address, label: "home", housingType: "apartment", isDefault: true });
      expect((await web<SavedAddress[]>("/customer/addresses", "GET", undefined, cookie)).value[0]).toMatchObject({ id: addresses[0]!.id, latitude: address.latitude, longitude: address.longitude });
      const value = { ...input(), items: [{ productId: created.id, quantity: "1.5", qualityOptionId: null }], deliverySlotId: config.operationsSlotId };
      const checked = await quote(value);
      expect(checked.valid).toBe(true); expect(checked.totalEstimated).toBe("23.50");
      const receipt = await mobile<OrderReceipt>("/checkout/orders", "POST", order(checked, value));
      const history = await mobile<{ id: string; orderNumber: string }[]>("/customer/orders");
      const owned = history.find(row => row.orderNumber === receipt.orderNumber)!;
      expect((await web<{ orderNumber: string }[]>("/customer/orders", "GET", undefined, cookie)).value.some(row => row.orderNumber === receipt.orderNumber)).toBe(true);
      const admin = await ops<AdminOrder>("admin", `/orders/${owned.id}`);
      expect(admin.address.street).toBe(address.street);
      const wave = await ops<AdminWave>("admin", "/delivery-waves", "POST", { deliverySlotId: config.operationsSlotId });
      expect(wave.pickingList).toHaveLength(1);
      await ops("admin", `/delivery-waves/${wave.id}/assignments`, "PATCH", { pickerUserId: config.staff.picker.id, courierUserId: config.staff.courier.id });
      expect((await ops<AdminOrder[]>("picker", `/orders?deliverySlotId=${config.operationsSlotId}`)).some(row => row.id === owned.id)).toBe(true);
      await ops("picker", `/delivery-waves/${wave.id}/status`, "PATCH", { status: "picking" });
      await ops("picker", `/delivery-waves/${wave.id}/items/${wave.pickingList[0]!.id}`, "PATCH", { purchasedQuantity: "1.6", purchaseUnitPrice: "8" });
      await ops("picker", `/orders/${owned.id}/items/${admin.items[0]!.id}`, "PATCH", { status: "picked", finalQuantity: "1.48" });
      await ops("picker", `/orders/${owned.id}/pack`, "POST");
      await ops("picker", `/delivery-waves/${wave.id}/status`, "PATCH", { status: "picked" });
      const courier = await ops<AdminOrder>("courier", `/orders/${owned.id}`);
      expect(courier.address.street).toBe(address.street);
      await ops("courier", `/delivery-waves/${wave.id}/status`, "PATCH", { status: "out_for_delivery" });
      expect((await api.request<PublicOrderDto>(`/public/orders/${receipt.publicTrackingToken}`)).status).toBe("out_for_delivery");
      await ops("courier", `/orders/${owned.id}/status`, "PATCH", { status: "delivered" });
      await ops("courier", `/orders/${owned.id}/paid`, "POST");
      // The final delivered order closes its shared wave automatically.
      expect((await ops<AdminWave>("courier", `/delivery-waves/${wave.id}`)).status).toBe("delivered");
      const tracked = await mobile<PublicOrderDto>(`/customer/orders/${owned.id}`);
      expect(tracked.status).toBe("delivered"); expect(tracked.money.payable).toBe("23.28");
      expect((await web<PublicOrderDto>(`/customer/orders/${owned.id}`, "GET", undefined, cookie)).value.money.payable).toBe(tracked.money.payable);
      await ops("admin", `/products/${created.id}`, "PATCH", { sellingPrice: "12" });
      const repeated = await mobile<{ items: { product: { id: string; sellingPrice: string } }[] }>(`/customer/orders/${owned.id}/repeat`, "POST", {});
      expect(repeated.items[0]?.product).toMatchObject({ id: created.id, sellingPrice: "12" });
      await mobile("/auth/logout", "POST", { refreshToken: native.refreshToken });
      expect((await web<CustomerProfile>("/customer-auth/me", "GET", undefined, cookie)).value.id).toBe(browserLogin.value.id);
    }, 60000);
  },
);
