import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PriceMode, BulkPricingPreviewInput } from "@dushanbe-fresh/shared";

export const pricingSettingKey = "catalog_default_markup_percent";

export function parseMarkup(value: unknown): string {
  if (typeof value !== "string" || !/^\d{1,5}(\.\d{1,2})?$/.test(value) || new Prisma.Decimal(value).gt(10000)) {
    throw new BadRequestException("Наценка должна быть от 0 до 10000%, до двух знаков после точки.");
  }
  return new Prisma.Decimal(value).toFixed(2);
}

export function parsePriceMode(value: unknown): PriceMode {
  if (value !== "manual" && value !== "auto") throw new BadRequestException("Укажите режим цены: manual или auto.");
  return value;
}

export function parsePricingId(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) throw new BadRequestException("Укажите идентификатор запроса или операции.");
  return value.trim();
}

export function parseBulkPreview(body: Record<string, unknown>): BulkPricingPreviewInput {
  const selection = body.selection;
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) throw new BadRequestException("Явно выберите товары, категории или все товары.");
  const raw = selection as Record<string, unknown>;
  const keys = Object.keys(raw);
  if (keys.length !== 1 || !["ids", "categoryIds", "all"].includes(keys[0])) throw new BadRequestException("Допустим ровно один способ выбора товаров.");
  if (keys[0] === "all") {
    if (raw.all !== true) throw new BadRequestException("Подтвердите выбор всех товаров.");
  } else {
    const ids = raw[keys[0]];
    if (!Array.isArray(ids) || !ids.length || ids.length > 2000) throw new BadRequestException("Выберите от 1 до 2000 идентификаторов.");
    raw[keys[0]] = [...new Set(ids.map(parsePricingId))].sort();
  }
  if (body.overwriteManual !== undefined && typeof body.overwriteManual !== "boolean") throw new BadRequestException("Подтверждение перезаписи ручных цен должно быть переключателем.");
  return { selection: raw as BulkPricingPreviewInput["selection"], markupPercent: parseMarkup(body.markupPercent), overwriteManual: body.overwriteManual === true };
}

export function calculateSalePrice(purchase: Prisma.Decimal | string | null | undefined, markup: Prisma.Decimal | string): Prisma.Decimal | null {
  if (purchase == null || new Prisma.Decimal(purchase).lte(0)) return null;
  const price = new Prisma.Decimal(purchase).times(new Prisma.Decimal(markup).div(100).plus(1)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (price.gt("9999999999.99")) throw new BadRequestException("Цена с наценкой превышает допустимую сумму.");
  return price;
}

// A single catalog writer lock keeps previews, bulk operations and ordinary edits ordered.
export async function lockPricing(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7412055)`;
}

export async function defaultMarkup(tx: Prisma.TransactionClient) {
  const setting = await tx.appSetting.findUnique({ where: { key: pricingSettingKey } });
  return parseMarkup(setting?.value ?? "10.00");
}
