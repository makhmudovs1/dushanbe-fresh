import { describe, expect, it } from "vitest";
import { checkDeliveryZone, parseDeliveryPolygon, parseDeliveryZone, unrestrictedDeliveryZone } from "./delivery-zone";

const ring = [[68.76, 38.55], [68.80, 38.55], [68.80, 38.60], [68.76, 38.60], [68.76, 38.55]];
const polygon = () => parseDeliveryPolygon({ type: "Polygon", coordinates: [ring] })!;
describe("delivery zone geometry", () => {
  it("accepts a valid administrator polygon and strips unrelated fields", () => {
    expect(parseDeliveryZone({ version: 1, enabled: true, polygon: polygon(), secret: "ignored" })).toEqual({ version: 1, enabled: true, polygon: polygon() });
  });
  it.each([null, {}, { version: 1, enabled: "false", polygon: null }, { version: 2, enabled: false, polygon: null }, { version: 1, enabled: true, polygon: null }])("rejects invalid configuration %j", input => {
    expect(parseDeliveryZone(input)).toBeNull();
  });
  it.each([
    [], ring.slice(0, -1), [[68, 38], [69, 39], [69, 38], [68, 39], [68, 38]],
    [[68, 38], [69, 39], [70, 40], [68, 38]],
    [[68, 38], [68, 38], [69, 39], [68, 38]],
    [[68, 38], [181, 38], [69, 39], [68, 38]],
    [[68, 38], [69, NaN], [69, 39], [68, 38]],
    [[-170, 38], [170, 38], [170, 39], [-170, 38]]
  ].map(points => ({ points })))("rejects degenerate, self-crossing or malformed rings %#", ({ points }) => {
    expect(parseDeliveryPolygon({ type: "Polygon", coordinates: [points] })).toBeNull();
  });
  it("rejects holes, multipolygons and excessive vertices for the MVP editor", () => {
    expect(parseDeliveryPolygon({ type: "Polygon", coordinates: [ring, ring] })).toBeNull();
    expect(parseDeliveryPolygon({ type: "MultiPolygon", coordinates: [[ring]] })).toBeNull();
    expect(parseDeliveryPolygon({ type: "Polygon", coordinates: [Array.from({ length: 202 }, () => [68, 38])] })).toBeNull();
  });
  it("checks inside, outside and inclusive boundary with longitude/latitude ordering", () => {
    const zone = { version: 1 as const, enabled: true, polygon: polygon() };
    expect(checkDeliveryZone(zone, { latitude: 38.57, longitude: 68.78 })).toBe("allowed");
    expect(checkDeliveryZone(zone, { latitude: 38.57, longitude: 68.82 })).toBe("outside");
    expect(checkDeliveryZone(zone, { latitude: 38.55, longitude: 68.76 })).toBe("allowed");
    expect(checkDeliveryZone(zone, { latitude: 68.78, longitude: 38.57 })).toBe("outside");
    expect(checkDeliveryZone(zone, {})).toBe("point_required");
  });
  it("disabling preserves the polygon and removes all spatial restrictions", () => {
    const zone = parseDeliveryZone({ version: 1, enabled: false, polygon: polygon() })!;
    expect(zone.polygon).toEqual(polygon());
    expect(checkDeliveryZone(zone, { latitude: 55.75, longitude: 37.62 })).toBe("allowed");
    expect(checkDeliveryZone(unrestrictedDeliveryZone, {})).toBe("allowed");
    expect(checkDeliveryZone(zone, { latitude: NaN, longitude: 68 })).toBe("invalid");
    expect(checkDeliveryZone(zone, { latitude: 38 })).toBe("invalid");
  });
});
