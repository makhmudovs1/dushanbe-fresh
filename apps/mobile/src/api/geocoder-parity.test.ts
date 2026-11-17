import { describe, expect, it } from "vitest";
import { parseGeoapifyAddresses as nativeParse } from "../../../api/src/mobile/geocoding/geoapify-provider";
const { parseGeoapifyAddresses: webParse } = await import(new URL("../../../web/src/lib/delivery-address-search.ts", import.meta.url).href);
const bounds: [number, number, number, number] = [68.60, 38.40, 68.95, 38.75];
const location = { lat: 38.56, lon: 68.77, city: "Душанбе", country_code: "tj" };
describe("current WEB/native server geocoder contract", () => {
  it.each([
    { ...location, street: "Рӯдакӣ", result_type: "street" },
    { ...location, street: "Рудаки", housenumber: "15", result_type: "building" },
    { ...location, name: "Гипрозем", result_type: "amenity" },
    { ...location, district: "Сомонӣ", result_type: "district" },
    { ...location, street: "Outside", city: "Other city", result_type: "street" },
    { ...location, street: "Outside", lat: 42, result_type: "street" },
  ])("retains genuine streets and landmarks without inventing house details: $result_type", row => {
    expect(nativeParse({ results: [row] }, bounds, true)).toEqual(webParse({ results: [row] }, bounds, true));
  });
  it("returns a landmark as a destination requiring manual street clarification", () => {
    expect(nativeParse({ results: [{ ...location, name: "Гипрозем", result_type: "amenity" }] }, bounds, true)?.[0]).toMatchObject({ street: "", building: "", placeName: "Гипрозем", latitude: location.lat, longitude: location.lon });
  });
});
