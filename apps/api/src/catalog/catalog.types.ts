import { Prisma } from "@prisma/client";

export type ProductWithCategoryAndOptions = Prisma.ProductGetPayload<{
  include: {
    category: true;
    qualityOptions: true;
  };
}>;

export type CategoryDto = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive?: boolean;
};

export type PublicProductDto = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  unit: string;
  sellingPrice: string;
  isWeighted: boolean;
  minQuantity: string;
  quantityStep: string;
  category: {
    id: string;
    name: string;
    slug: string;
  };
  qualityOptions: Array<{
    id: string;
    label: string;
    sortOrder: number;
  }>;
};

export type AdminProductDto = PublicProductDto & {
  purchasePrice: string;
  isActive: boolean;
  isAvailableToday: boolean;
  sortOrder: number;
};

export type ProductFilters = {
  category?: string;
  search?: string;
};

export type CategoryInput = {
  name: string;
  slug: string;
  sortOrder?: number;
  isActive?: boolean;
};

export type ProductInput = {
  categoryId: string;
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
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
