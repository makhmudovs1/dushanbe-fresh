import { Category, ProductQualityOption } from "@prisma/client";
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
  return {
    id: product.id,
    name: product.name,
    nameTj: product.nameTj,
    slug: product.slug,
    description: productDescription(product, "ru"),
    descriptionTj: productDescription(product, "tg"),
    image: catalogImage(product.imageUrl),
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
    sortOrder: product.sortOrder
  };
}
