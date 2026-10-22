import { describe, expect, it } from "vitest";
import { CHECKOUT_DRAFT_KEY, loadCheckoutDraft, saveCheckoutDraft } from "./checkout-draft";
describe("checkout draft", () => {
  const draft = { contact: { name: "Ситора", phone: "+992900000001" }, address: { housingType: "house" as const, street: "Рудаки", building: "1", apartment: "", entrance: "", floor: "", instructions: "У ворот" }, deliverySlotId: "slot", policy: "contact_me" as const };
  it("preserves address, contact, slot and policy through login or reload", () => {
    let raw = "";
    saveCheckoutDraft({ setItem: (key, value) => { expect(key).toBe(CHECKOUT_DRAFT_KEY); raw = value; } }, draft);
    expect(loadCheckoutDraft({ getItem: () => raw })).toMatchObject(draft);
    expect(raw).not.toMatch(/token|code|password/i);
  });
  it("ignores expired or malformed data and tolerates disabled storage", () => {
    expect(loadCheckoutDraft({ getItem: () => "{" })).toBeNull();
    expect(loadCheckoutDraft({ getItem: () => JSON.stringify({ ...draft, savedAt: 1 }) })).toBeNull();
    expect(loadCheckoutDraft({ getItem: () => JSON.stringify({ ...draft, savedAt: Date.now(), address: { ...draft.address, latitude: "invalid", longitude: 68 } }) })).toBeNull();
    expect(() => saveCheckoutDraft({ setItem: () => { throw new Error("blocked"); } }, draft)).not.toThrow();
  });
});
