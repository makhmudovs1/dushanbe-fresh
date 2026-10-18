import { Prisma, ProductImage, ProductPriceHistory } from "@prisma/client";
import type { GalleryInput } from "./catalog.gallery";

export type ProductWithCategoryAndOptions = Prisma.ProductGetPayload<{
  include: {
    category: true;
    qualityOptions: true;
  };
}> & { images?: ProductImage[]; priceHistory?: ProductPriceHistory[] };

export type CategoryDto = {
  id: string;
  name: string;
  nameTj?: string | null;
  slug: string;
  sortOrder: number;
  isActive?: boolean;
  isVisible?: boolean;
  imageUrl?: string | null;
  iconUrl?: string | null;
  parentId?: string | null;
};

export type PublicProductDto = {
  id: string;
  name: string;
  nameTj?: string | null;
  slug: string;
  description: string | null;
  descriptionTj?: string | null;
  image: string | null;
  images: Array<{ id: string; url: string; sortOrder: number; isPrimary: boolean }>;
  priceDrop: { oldPrice: string; discountPercent: number } | null;
  unit: string;
  sellingPrice: string;
  isWeighted: boolean;
  minQuantity: string;
  quantityStep: string;
  category: {
    id: string;
    name: string;
    nameTj?: string | null;
    slug: string;
  };
  qualityOptions: Array<{
    id: string;
    label: string;
    labelTj?: string | null;
    sortOrder: number;
  }>;
};

export type AdminProductDto = PublicProductDto & {
  purchasePrice: string;
  isActive: boolean;
  isAvailableToday: boolean;
  sortOrder: number;
  lastPriceChange: { oldPrice: string; newPrice: string; changedAt: string } | null;
};

export type ProductFilters = {
  category?: string;
  search?: string;
};

export type CategoryInput = {
  name: string;
  nameTj?: string | null;
  slug: string;
  imageUrl?: string | null;
  iconUrl?: string | null;
  parentId?: string | null;
  isVisible?: boolean;
  sortOrder?: number;
  isActive?: boolean;
};

export type ProductInput = {
  categoryId: string;
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
  images?: GalleryInput[];
  unit: string;
  sellingPrice: string;
  purchasePrice: string;
  isWeighted?: boolean;
  minQuantity: string;
  quantityStep: string;
  isActive?: boolean;
  isAvailableToday?: boolean;
  sortOrder?: number;
  qualityOptions?: Array<{
    id?: string;
    label: string;
    sortOrder?: number;
    isActive?: boolean;
  }>;
};

export type ProductUpdateInput = Partial<ProductInput>;
