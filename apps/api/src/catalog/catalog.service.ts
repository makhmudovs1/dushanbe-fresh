import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { mapAdminProduct, mapCategory, mapPublicProduct } from "./catalog.mappers";
import {
  CategoryInput,
  ProductFilters,
  ProductInput,
  ProductUpdateInput
} from "./catalog.types";

const productInclude = {
  category: true,
  qualityOptions: {
    orderBy: {
      sortOrder: "asc" as const
    }
  }
};

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublicCategories() {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    });

    return categories.map((category) => mapCategory(category));
  }

  async listPublicProducts(filters: ProductFilters = {}) {
    const products = await this.prisma.product.findMany({
      where: this.publicProductWhere(filters),
      include: productInclude,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    });

    return products.map((product) => mapPublicProduct(product));
  }

  async getPublicProductBySlug(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        slug,
        isActive: true,
        isAvailableToday: true,
        category: { isActive: true }
      },
      include: productInclude
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    return mapPublicProduct(product);
  }

  async listAdminCategories() {
    const categories = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    });

    return categories.map((category) => mapCategory(category, true));
  }

  async createAdminCategory(input: CategoryInput) {
    const category = await this.prisma.category.create({
      data: {
        name: input.name,
        slug: input.slug,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true
      }
    });

    return mapCategory(category, true);
  }

  async updateAdminCategory(id: string, input: Partial<CategoryInput>) {
    const category = await this.prisma.category.update({
      where: { id },
      data: {
        name: input.name,
        slug: input.slug,
        sortOrder: input.sortOrder,
        isActive: input.isActive
      }
    });

    return mapCategory(category, true);
  }

  async listAdminProducts(filters: ProductFilters = {}) {
    const products = await this.prisma.product.findMany({
      where: this.adminProductWhere(filters),
      include: productInclude,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    });

    return products.map((product) => mapAdminProduct(product));
  }

  async createAdminProduct(input: ProductInput) {
    const product = await this.prisma.product.create({
      data: this.toCreateProductData(input),
      include: productInclude
    });

    return mapAdminProduct(product);
  }

  async updateAdminProduct(id: string, input: ProductUpdateInput) {
    const product = await this.prisma.product.update({
      where: { id },
      data: this.toUpdateProductData(input),
      include: productInclude
    });

    return mapAdminProduct(product);
  }

  private publicProductWhere(filters: ProductFilters): Prisma.ProductWhereInput {
    return {
      isActive: true,
      isAvailableToday: true,
      category: {
        isActive: true,
        ...(filters.category ? { slug: filters.category } : {})
      },
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" } },
              { description: { contains: filters.search, mode: "insensitive" } }
            ]
          }
        : {})
    };
  }

  private adminProductWhere(filters: ProductFilters): Prisma.ProductWhereInput {
    return {
      ...(filters.category ? { category: { slug: filters.category } } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" } },
              { description: { contains: filters.search, mode: "insensitive" } }
            ]
          }
        : {})
    };
  }

  private toCreateProductData(input: ProductInput): Prisma.ProductCreateInput {
    return {
      category: { connect: { id: input.categoryId } },
      name: input.name,
      slug: input.slug,
      description: input.description,
      imageUrl: input.image,
      unit: input.unit,
      currentSalePrice: new Prisma.Decimal(input.sellingPrice),
      currentPurchasePrice: new Prisma.Decimal(input.purchasePrice),
      isWeighted: input.isWeighted ?? false,
      minQuantity: new Prisma.Decimal(input.minQuantity),
      quantityStep: new Prisma.Decimal(input.quantityStep),
      isActive: input.isActive ?? true,
      isAvailableToday: input.isAvailableToday ?? true,
      sortOrder: input.sortOrder ?? 0,
      qualityOptions: input.qualityOptions
        ? {
            create: input.qualityOptions.map((option) => ({
              label: option.label,
              sortOrder: option.sortOrder ?? 0,
              isActive: option.isActive ?? true
            }))
          }
        : undefined
    };
  }

  private toUpdateProductData(input: ProductUpdateInput): Prisma.ProductUpdateInput {
    const data: Prisma.ProductUpdateInput = {};

    if (input.categoryId !== undefined) data.category = { connect: { id: input.categoryId } };
    if (input.name !== undefined) data.name = input.name;
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.description !== undefined) data.description = input.description;
    if (input.image !== undefined) data.imageUrl = input.image;
    if (input.unit !== undefined) data.unit = input.unit;
    if (input.sellingPrice !== undefined) data.currentSalePrice = new Prisma.Decimal(input.sellingPrice);
    if (input.purchasePrice !== undefined) {
      data.currentPurchasePrice = new Prisma.Decimal(input.purchasePrice);
    }
    if (input.isWeighted !== undefined) data.isWeighted = input.isWeighted;
    if (input.minQuantity !== undefined) data.minQuantity = new Prisma.Decimal(input.minQuantity);
    if (input.quantityStep !== undefined) data.quantityStep = new Prisma.Decimal(input.quantityStep);
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.isAvailableToday !== undefined) data.isAvailableToday = input.isAvailableToday;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.qualityOptions !== undefined) {
      data.qualityOptions = {
        deleteMany: {},
        create: input.qualityOptions.map((option) => ({
          label: option.label,
          sortOrder: option.sortOrder ?? 0,
          isActive: option.isActive ?? true
        }))
      };
    }

    return data;
  }
}
