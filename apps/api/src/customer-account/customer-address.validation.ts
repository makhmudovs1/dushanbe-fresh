import { BadRequestException } from "@nestjs/common";
import type { AddressInput, SavedAddressInput } from "@dushanbe-fresh/shared";

export function customerText(value: unknown, max: number, optional = false): string {
  if (optional && (value === undefined || value === null || value === "")) return "";
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new BadRequestException("Проверьте данные адреса или имя.");
  return value.trim();
}

export function parseAddress(value: unknown): AddressInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("Проверьте адрес доставки.");
  const body = value as Record<string, unknown>;
  const housingType = body.housingType ?? "apartment";
  if (housingType !== "apartment" && housingType !== "house") throw new BadRequestException("Выберите тип жилья.");
  const latitude = body.latitude ?? null;
  const longitude = body.longitude ?? null;
  if ((latitude === null) !== (longitude === null) || (latitude !== null && (typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90)) || (longitude !== null && (typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180))) throw new BadRequestException("Проверьте точку на карте.");
  return { housingType, latitude: latitude as number | null, longitude: longitude as number | null,
    street: customerText(body.street, 150), building: customerText(body.building, 30),
    apartment: housingType === "house" ? "" : customerText(body.apartment, 30, true),
    entrance: housingType === "house" ? "" : customerText(body.entrance, 30, true),
    floor: housingType === "house" ? "" : customerText(body.floor, 30, true),
    intercom: customerText(body.intercom, 30, true), instructions: customerText(body.instructions, 500, true) };
}

export function parseSavedAddress(value: unknown): SavedAddressInput {
  const address = parseAddress(value);
  const body = value as Record<string, unknown>;
  if (!["home", "work", "other"].includes(String(body.label)) || typeof body.isDefault !== "boolean") throw new BadRequestException("Выберите название адреса.");
  return { ...address, label: body.label as SavedAddressInput["label"], isDefault: body.isDefault };
}
