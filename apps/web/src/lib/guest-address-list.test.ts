import { expect, it } from "vitest";
import { emptyAddress, GUEST_ADDRESS_LIST_KEY, loadGuestAddressList, parseAddressSuggestion, saveGuestAddressList } from "./delivery-address";

it("round-trips guest labels/coordinates and rejects broken or expired lists", () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const address = { ...emptyAddress, id: "guest-test", street: "Рудаки", building: "15", latitude: 38.56, longitude: 68.77, label: "work" as const, isDefault: false };
  saveGuestAddressList(storage, [address]); expect(loadGuestAddressList(storage)).toEqual([address]);
  data.set(GUEST_ADDRESS_LIST_KEY, JSON.stringify({ version: 1, savedAt: Date.now() - 86400001, addresses: [address] }));
  expect(loadGuestAddressList(storage)).toEqual([]);
  data.set(GUEST_ADDRESS_LIST_KEY, "invalid"); expect(loadGuestAddressList(storage)).toEqual([]);
});

it("keeps sanitized suggestion subtitles but does not put metadata into the address model", () => {
  const address = { ...emptyAddress, street: "Рудаки", building: "15", description: "Сино, Душанбе" };
  expect(parseAddressSuggestion(address)?.description).toBe("Сино, Душанбе");
  expect(parseAddressSuggestion({ ...address, description: "x\u0000" })?.description).toBeUndefined();
});
