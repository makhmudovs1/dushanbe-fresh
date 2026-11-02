import { describe, expect, it } from "vitest";
import { emptyAddress, parseDeliveryAddress } from "./delivery-address";
import { refreshedDeliveryAddress } from "./delivery-address-refresh";

const saved = { ...emptyAddress, id: "home", label: "home" as const, isDefault: true, street: "Рудаки", building: "15", latitude: 38.567891234567, longitude: 68.789123456789 };
const selected = parseDeliveryAddress(saved)!;
const remote = { ...saved, street: "Сомонӣ", building: "20", latitude: 38.578912345678, longitude: 68.798123456789 };

describe("saved delivery address revalidation", () => {
  it("selects the server default only when selection and address draft are empty", () => {
    expect(refreshedDeliveryAddress(null, [], [remote], null, true)).toEqual(parseDeliveryAddress(remote));
    expect(refreshedDeliveryAddress(null, [], [remote], emptyAddress, false)).toEqual(parseDeliveryAddress(remote));
    for (const draft of [{ ...emptyAddress, street: "manual" }, { ...emptyAddress, intercom: "15B" }, selected]) {
      expect(refreshedDeliveryAddress(null, [], [remote], draft, true)).toBeNull();
      expect(refreshedDeliveryAddress(null, [], [remote], draft, false)).toBeNull();
    }
  });

  it("keeps passive refresh from replacing a selected address after a remote edit, deletion or default change", () => {
    for (const addresses of [[remote], [], [{ ...remote, id: "work" }]]) {
      expect(refreshedDeliveryAddress(selected, [saved], addresses, null, true)).toBe(selected);
    }
  });

  it("preserves manual selection and a distinct partial checkout draft even for explicit refresh", () => {
    const manual = { ...selected, instructions: "manual" };
    expect(refreshedDeliveryAddress(manual, [saved], [remote], null, false)).toBe(manual);
    expect(refreshedDeliveryAddress(selected, [saved], [remote], { ...emptyAddress, instructions: "draft" }, false)).toBe(selected);
  });

  it("still reconciles an explicit saved-address edit or deletion without a distinct draft", () => {
    expect(refreshedDeliveryAddress(selected, [saved], [remote], selected, false)).toEqual(parseDeliveryAddress(remote));
    expect(refreshedDeliveryAddress(selected, [saved], [], null, false)).toBeNull();
    expect(refreshedDeliveryAddress(selected, [saved], [{ ...remote, id: "work" }], null, false)).toEqual(parseDeliveryAddress(remote));
    expect(refreshedDeliveryAddress(selected, [saved], [saved], null, false)).toBe(selected);
  });

  it("does not invent a default or select one outside the existing delivery bounds", () => {
    expect(refreshedDeliveryAddress(null, [], [{ ...remote, isDefault: false }], null, true)).toBeNull();
    expect(refreshedDeliveryAddress(null, [], [{ ...remote, latitude: 55 }], null, false)).toBeNull();
  });

  it("preserves RU/TJ text and the exact coordinate pair", () => {
    for (const address of [saved, remote, { ...remote, latitude: null, longitude: null }]) {
      const result = refreshedDeliveryAddress(null, [], [address], null, true);
      expect(result?.street).toBe(address.street);
      expect(result?.latitude).toBe(address.latitude);
      expect(result?.longitude).toBe(address.longitude);
    }
  });
});
