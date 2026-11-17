import { resolveAddressSelection, refreshSavedAddress } from "./address";
import { describe, expect, it } from "vitest";
import { parseAddressDraft, sameAddress } from "./address";
const address = {
  label: "home" as const,
  housingType: "apartment" as const,
  street: "Рудаки",
  building: "10",
  apartment: "1",
  entrance: "",
  floor: "",
  instructions: "",
  latitude: 38.5,
  longitude: 68.8,
};
describe("address drafts and exact saved selection", () => {
  it("preserves selected coordinates during manual street/house clarification", () => {
    expect(
      parseAddressDraft({
        ...address,
        street: " Другая улица ",
        building: "12",
      }),
    ).toMatchObject({
      street: "Другая улица",
      building: "12",
      latitude: 38.5,
      longitude: 68.8,
    });
  });
  it.each([
    { ...address, latitude: 91 },
    { ...address, longitude: null },
    { ...address, street: {} },
    { ...address, building: "" },
  ])("rejects a damaged draft", (value) => {
    expect(parseAddressDraft(value)).toBeNull();
  });
  it("does not confuse two saved entrances at the same street and house", () => {
    expect(sameAddress(address, { ...address, entrance: "2" })).toBe(false);
    expect(sameAddress(address, { ...address, latitude: 38.50001 })).toBe(
      false,
    );
    expect(sameAddress(address, { ...address })).toBe(true);
  });
});

describe("checkout address selection parity", () => {
  const empty = {
    street: "",
    building: "",
    apartment: "",
    entrance: "",
    floor: "",
    instructions: "",
  };
  const saved = { ...empty, street: "Рудаки", building: "10" };
  it("uses restored address only for a pristine form", () => {
    expect(resolveAddressSelection(empty, saved, false)).toEqual(saved);
    expect(
      resolveAddressSelection(
        { ...empty, street: "Мой черновик" },
        saved,
        false,
      ).street,
    ).toBe("Мой черновик");
  });
  it("uses an explicit picker selection and retains an existing form when no selection arrives", () => {
    expect(
      resolveAddressSelection(
        { ...empty, street: "Мой черновик" },
        saved,
        true,
      ),
    ).toEqual(saved);
    expect(resolveAddressSelection(saved, null, false)).toBe(saved);
  });
});

describe("passive multidevice address refresh", () => {
  const saved = { ...address, id: "home-1", isDefault: true };
  it("hydrates a default only before any checkout selection", () => {
    expect(refreshSavedAddress(null, null, [saved])).toEqual({ address: saved, selectedId: saved.id });
  });
  it("keeps a selected snapshot when another device edits it", () => {
    expect(refreshSavedAddress(address, saved.id, [{ ...saved, building: "99" }])).toEqual({ address, selectedId: saved.id });
  });
  it("keeps checkout details after remote removal and clears only the saved ID", () => {
    expect(refreshSavedAddress(address, saved.id, [])).toEqual({ address, selectedId: null });
  });
  it("never replaces a manual address when a remote default appears", () => {
    expect(refreshSavedAddress(address, null, [{ ...saved, street: "Другая улица" }])).toEqual({ address, selectedId: null });
  });
});
