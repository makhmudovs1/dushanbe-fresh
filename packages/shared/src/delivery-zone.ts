import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import { kinks } from "@turf/kinks";
import { area } from "@turf/area";
import { cleanCoords } from "@turf/clean-coords";

export const DELIVERY_ZONE_KEY = "delivery_zone";
export const MAX_ZONE_VERTICES = 200;
export type DeliveryPolygon = { type: "Polygon"; coordinates: [number, number][][] };
export type DeliveryZone = { version: 1; enabled: boolean; polygon: DeliveryPolygon | null };
export type DeliveryZoneState = { zone: DeliveryZone; revision: string | null };
export const unrestrictedDeliveryZone: DeliveryZone = { version: 1, enabled: false, polygon: null };
export type CoordinatePoint = { latitude?: number | null; longitude?: number | null };
export type DeliveryZoneResult = "allowed" | "outside" | "point_required" | "invalid";
export const deliveryZoneMessages = {
  outside: "Пока не доставляем по этому адресу. Выберите точку внутри зоны доставки.",
  point_required: "Отметьте дом на карте, чтобы проверить доставку.",
  invalid: "Проверьте точку на карте.",
  unavailable: "Не удалось проверить зону доставки. Повторите попытку."
} as const;

export function validCoordinatePoint(point: CoordinatePoint): boolean {
  return typeof point.latitude === "number" && typeof point.longitude === "number"
    && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
}

export function parseDeliveryPolygon(value: unknown): DeliveryPolygon | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.type !== "Polygon" || !Array.isArray(input.coordinates) || input.coordinates.length !== 1) return null;
  const ring: unknown = input.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > MAX_ZONE_VERTICES + 1) return null;
  const points: [number, number][] = [];
  for (const point of ring) {
    if (!Array.isArray(point) || point.length !== 2 || !validCoordinatePoint({ latitude: point[1], longitude: point[0] }) || Math.abs(point[1]) > 85) return null;
    points.push([point[0], point[1]]);
  }
  const first = points[0], last = points[points.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return null;
  if (new Set(points.slice(0, -1).map(point => JSON.stringify(point))).size !== points.length - 1) return null;
  // A local service polygon must not wrap across the antimeridian.
  if (Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0])) >= 180) return null;
  const polygon: DeliveryPolygon = { type: "Polygon", coordinates: [points] };
  try { return cleanCoords(polygon).coordinates[0].length >= 4 && area(polygon) >= 1 && kinks(polygon).features.length === 0 ? polygon : null; }
  catch { return null; }
}

export function parseDeliveryZone(value: unknown): DeliveryZone | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.version !== 1 || typeof input.enabled !== "boolean") return null;
  const polygon = input.polygon === null ? null : parseDeliveryPolygon(input.polygon);
  if ((!polygon && input.polygon !== null) || (input.enabled && !polygon)) return null;
  return { version: 1, enabled: input.enabled, polygon };
}

export function checkDeliveryZone(zone: DeliveryZone, point: CoordinatePoint): DeliveryZoneResult {
  if (point.latitude == null && point.longitude == null) return zone.enabled ? "point_required" : "allowed";
  if (!validCoordinatePoint(point)) return "invalid";
  if (!zone.enabled) return "allowed";
  if (!zone.polygon) return "invalid";
  return booleanPointInPolygon([point.longitude!, point.latitude!], zone.polygon, { ignoreBoundary: false }) ? "allowed" : "outside";
}
