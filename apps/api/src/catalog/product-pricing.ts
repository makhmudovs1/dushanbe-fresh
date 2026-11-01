import { BadRequestException } from "@nestjs/common";
import { Prisma, Product } from "@prisma/client";
import { ProductInput, ProductUpdateInput } from "./catalog.types";
import { calculateSalePrice, defaultMarkup, parseMarkup, parsePriceMode } from "./pricing.rules";

type PricingData = { priceMode?: string; markupPercent?: Prisma.Decimal | null; appliedMarkupPercent?: Prisma.Decimal; currentSalePrice?: Prisma.Decimal };

export async function productPricingData(tx: Prisma.TransactionClient, input: ProductInput | ProductUpdateInput, existing?: Product): Promise<PricingData> {
  const data: PricingData = {};
  const mode = input.priceMode ?? existing?.priceMode ?? (input.sellingPrice === undefined ? "auto" : "manual");
  parsePriceMode(mode);
  if (!existing || input.priceMode !== undefined) data.priceMode = mode;
  if (input.markupPercent !== undefined) data.markupPercent = input.markupPercent === null ? null : new Prisma.Decimal(parseMarkup(input.markupPercent));
  if (mode === "manual") {
    if (!existing && input.sellingPrice === undefined) throw new BadRequestException("Укажите ручную цену для клиента.");
    return data;
  }
  const pricingEdit = !existing || [input.priceMode, input.markupPercent, input.purchasePrice, input.categoryId, input.sellingPrice].some(value => value !== undefined);
  if (!pricingEdit) return data;
  const override = input.markupPercent !== undefined ? input.markupPercent : existing?.markupPercent?.toString();
  let effective = override ?? existing?.appliedMarkupPercent?.toString();
  if (!existing || input.markupPercent !== undefined || input.categoryId !== undefined || input.priceMode !== undefined) {
    const category = await tx.category.findUniqueOrThrow({ where: { id: input.categoryId ?? existing!.categoryId } });
    effective = override ?? category.markupPercent?.toString() ?? await defaultMarkup(tx);
  }
  effective ??= await defaultMarkup(tx);
  const price = calculateSalePrice(input.purchasePrice ?? existing?.currentPurchasePrice, effective);
  if (!price) throw new BadRequestException("Для автоматической цены нужна положительная закупочная цена.");
  if (input.sellingPrice !== undefined && !price.equals(input.sellingPrice)) throw new BadRequestException("Автоматическая цена вычисляется из закупки. Для своей цены выберите manual.");
  data.currentSalePrice = price;
  data.appliedMarkupPercent = new Prisma.Decimal(effective);
  return data;
}

export function pricingState(product: Product) {
  return {
    purchasePrice: product.currentPurchasePrice.toFixed(2),
    sellingPrice: product.currentSalePrice.toFixed(2),
    priceMode: product.priceMode ?? "manual",
    markupPercent: product.markupPercent?.toFixed(2) ?? null,
    appliedMarkupPercent: product.appliedMarkupPercent?.toFixed(2) ?? null
  };
}
