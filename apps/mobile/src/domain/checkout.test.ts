import { describe, expect, it, vi } from "vitest";
import type { CreateOrderInput, OrderReceipt } from "@dushanbe-fresh/shared";
import {
  normalizePhone,
  OrderSubmission,
  quoteKey,
  type CheckoutJournal,
  type PendingOrder,
} from "./checkout";
const input: CreateOrderInput = {
  items: [{ productId: "white", quantity: "0.5", qualityOptionId: null }],
  deliverySlotId: "slot",
  address: {
    street: "Тестовая",
    building: "1",
    apartment: "",
    entrance: "",
    floor: "",
    instructions: "",
  },
  name: "Тест",
  phone: "+992000000000",
  requestId: "7e439da7-60f1-4050-9783-d299181386ea",
  reviewToken: "a".repeat(64),
  substitutionPolicy: "contact_me",
};
function journal() {
  let value: PendingOrder | null = null;
  return {
    read: async () => value,
    write: async (next: PendingOrder) => {
      value = next;
    },
    remove: async () => {
      value = null;
    },
  } satisfies CheckoutJournal;
}
describe("checkout safety", () => {
  it("keeps the exact payload and request ID across uncertain responses and app restart", async () => {
    const saved = journal();
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({ orderNumber: "test" });
    await expect(
      new OrderSubmission(saved, send).submit(input),
    ).rejects.toThrow("response lost");
    await new OrderSubmission(saved, send).submit({
      ...input,
      requestId: "different",
    });
    expect(send.mock.calls[1]?.[0]).toEqual(input);
    expect(await saved.read()).not.toBeNull();
  });
  it("never sends unless persistence succeeded", async () => {
    const send = vi.fn();
    const store = journal();
    store.write = async () => {
      throw new Error("keychain");
    };
    await expect(
      new OrderSubmission(store, send).submit(input),
    ).rejects.toThrow("keychain");
    expect(send).not.toHaveBeenCalled();
  });
  it("guards double submission", async () => {
    let finish: ((r: OrderReceipt) => void) | undefined;
    const client = new OrderSubmission(
      journal(),
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const one = client.submit(input);
    await expect(client.submit(input)).rejects.toThrow("IN_FLIGHT");
    await Promise.resolve();
    finish?.({ orderNumber: "test" } as OrderReceipt);
    await one;
  });
  it("clears journal only with explicit receipt acknowledgement", async () => {
    const saved = journal();
    const submission = new OrderSubmission(
      saved,
      async () => ({ orderNumber: "test" }) as OrderReceipt,
    );
    await submission.submit(input);
    expect(await saved.read()).not.toBeNull();
    await submission.acknowledge();
    expect(await saved.read()).toBeNull();
  });
  it("binds a review to items, slot and exact address point", () => {
    expect(quoteKey(input)).not.toBe(
      quoteKey({
        ...input,
        address: { ...input.address, latitude: 38.5, longitude: 68.8 },
      }),
    );
    expect(quoteKey(input)).not.toBe(
      quoteKey({ ...input, deliverySlotId: "other" }),
    );
  });
  it("normalizes only Tajikistan phone numbers", () => {
    expect(normalizePhone("97 000-00-00")).toBe("+992970000000");
    expect(normalizePhone("+992 97 000 00 00")).toBe("+992970000000");
    expect(normalizePhone("+79000000000")).toBeNull();
    expect(normalizePhone("test")).toBeNull();
  });
  it("never sends an interrupted order using another account or API scope", async () => {
    const saved = journal();
    await saved.write({
      input,
      scope: { apiBaseUrl: "https://one.invalid/api/v1", ownerId: "a" },
    });
    const send = vi.fn();
    const client = new OrderSubmission(saved, send, {
      apiBaseUrl: "https://two.invalid/api/v1",
      ownerId: "b",
    });
    await expect(client.submit(input)).rejects.toThrow("ORDER_OWNER_CHANGED");
    expect(send).not.toHaveBeenCalled();
  });
});
