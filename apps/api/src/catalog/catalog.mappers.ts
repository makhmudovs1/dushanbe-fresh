import { Category, ProductQualityOption, Prisma } from "@prisma/client";
import { productDescription } from "@dushanbe-fresh/shared";
import { catalogImage } from "./catalog.image";

import {
  AdminProductDto,
  CategoryDto,
  ProductWithCategoryAndOptions,
  PublicProductDto
} from "./catalog.types";

function decimalToString(value: { toString(): string }) {
  return value.toString();
}

export function mapCategory(category: Category, includeAdminFields = false): CategoryDto {
  const dto: CategoryDto = {
    id: category.id,
    name: category.name,
    nameTj: category.nameTj,
    slug: category.slug,
    sortOrder: category.sortOrder
  };

  if (includeAdminFields) {
    dto.isActive = category.isActive;
  }

  return dto;
}

function mapQualityOptions(options: ProductQualityOption[]) {
  return options
    .filter((option) => option.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((option) => ({
      id: option.id,
      label: option.label,
      labelTj: option.labelTj,
      sortOrder: option.sortOrder
    }));
}

export function mapPublicProduct(
  product: ProductWithCategoryAndOptions
): PublicProductDto {
  const images = (product.images ?? [])
    .filter(image => catalogImage(image.url))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .map(({ id, url, sortOrder, isPrimary }) => ({ id, url, sortOrder, isPrimary }));
  const lastChange = product.priceHistory?.[0];
  // Only the latest actual sale-price change qualifies. Never compare purchase prices.
  const priceDrop = lastChange && lastChange.newSalePrice.equals(product.currentSalePrice) && lastChange.oldSalePrice.greaterThan(0) && lastChange.newSalePrice.lessThan(lastChange.oldSalePrice)
    ? { oldPrice: lastChange.oldSalePrice.toString(), discountPercent: lastChange.oldSalePrice.minus(lastChange.newSalePrice).div(lastChange.oldSalePrice).times(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber() }
    : null;
  return {
    id: product.id,
    name: product.name,
    nameTj: product.nameTj,
    slug: product.slug,
    description: productDescription(product, "ru"),
    descriptionTj: productDescription(product, "tg"),
    image: images[0]?.url ?? catalogImage(product.imageUrl),
    images,
    priceDrop,
    unit: product.unit,
    sellingPrice: decimalToString(product.currentSalePrice),
    isWeighted: product.isWeighted,
    minQuantity: decimalToString(product.minQuantity),
    quantityStep: decimalToString(product.quantityStep),
    category: {
      id: product.category.id,
      name: product.category.name,
      nameTj: product.category.nameTj,
      slug: product.category.slug
    },
    qualityOptions: mapQualityOptions(product.qualityOptions)
  };
}

export function mapAdminProduct(
  product: ProductWithCategoryAndOptions
): AdminProductDto {
  return {
    ...mapPublicProduct(product),
    description: product.description,
    descriptionTj: product.descriptionTj,
    purchasePrice: decimalToString(product.currentPurchasePrice),
    isActive: product.isActive,
    isAvailableToday: product.isAvailableToday,
    sortOrder: product.sortOrder,
    lastPriceChange: product.priceHistory?.[0] ? {
      oldPrice: product.priceHistory[0].oldSalePrice.toString(),
      newPrice: product.priceHistory[0].newSalePrice.toString(),
      changedAt: product.priceHistory[0].changedAt.toISOString()
    } : null
  };
}
