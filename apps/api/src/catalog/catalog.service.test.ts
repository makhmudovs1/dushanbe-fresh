import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { CatalogService } from "./catalog.service";

const category = {
  id: "cat-1",
  name: "Овощи",
  slug: "vegetables",
  sortOrder: 10,
  isActive: true
};

const product = {
  id: "product-1",
  categoryId: category.id,
  name: "Помидоры",
  slug: "tomatoes",
  description: "Свежие помидоры",
  imageUrl: "/img/products/tomatoes.jpg",
  unit: "kg",
  currentPurchasePrice: new Prisma.Decimal("8.00"),
  currentSalePrice: new Prisma.Decimal("10.50"),
  isWeighted: true,
  minQuantity: new Prisma.Decimal("0.500"),
  quantityStep: new Prisma.Decimal("0.250"),
  isActive: true,
  isAvailableToday: true,
  sortOrder: 10,
  createdAt: new Date("2026-09-14T00:00:00.000Z"),
  updatedAt: new Date("2026-09-14T00:00:00.000Z"),
  category,
  qualityOptions: [
    {
      id: "quality-1",
      productId: "product-1",
      label: "спелые",
      sortOrder: 10,
      isActive: true
    }
  ]
};

function createService() {
  const prisma = {
    category: {
      findMany: vi.fn().mockResolvedValue([category]),
      create: vi.fn().mockResolvedValue(category),
      update: vi.fn().mockResolvedValue(category)
    },
    product: {
      findMany: vi.fn().mockResolvedValue([product]),
      findFirst: vi.fn().mockResolvedValue(product),
      create: vi.fn().mockResolvedValue(product),
      update: vi.fn().mockResolvedValue(product)
    }
  };

  return {
    prisma,
    service: new CatalogService(prisma as never)
  };
}

describe("CatalogService", () => {
  it("requests only active and available today products for public listing", async () => {
    const { prisma, service } = createService();

    await service.listPublicProducts();

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          isAvailableToday: true,
          category: { isActive: true }
        })
      })
    );
  });

  it("does not expose purchase price in public DTOs", async () => {
    const { service } = createService();

    const [dto] = await service.listPublicProducts();

    expect(dto.sellingPrice).toBe("10.5");
    expect(dto).not.toHaveProperty("purchasePrice");
    expect(JSON.stringify(dto)).not.toContain("currentPurchasePrice");
  });

  it("filters public products by category slug", async () => {
    const { prisma, service } = createService();

    await service.listPublicProducts({ category: "vegetables" });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          category: {
            isActive: true,
            slug: "vegetables"
          }
        })
      })
    );
  });

  it("searches public products by name and description", async () => {
    const { prisma, service } = createService();

    await service.listPublicProducts({ search: "пом" });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { name: { contains: "пом", mode: "insensitive" } },
            { description: { contains: "пом", mode: "insensitive" } }
          ]
        })
      })
    );
  });

  it("creates products through admin service with Decimal values", async () => {
    const { prisma, service } = createService();

    await service.createAdminProduct({
      categoryId: category.id,
      name: "Огурцы",
      slug: "cucumbers",
      description: "Хрустящие",
      image: "/img/products/cucumbers.jpg",
      unit: "kg",
      sellingPrice: "8.50",
      purchasePrice: "6.25",
      minQuantity: "0.500",
      quantityStep: "0.250",
      isWeighted: true,
      isActive: true,
      isAvailableToday: true,
      sortOrder: 20,
      qualityOptions: [{ label: "мелкие", sortOrder: 10 }]
    });

    const data = prisma.product.create.mock.calls[0]?.[0].data;

    expect(data.currentSalePrice).toBeInstanceOf(Prisma.Decimal);
    expect(data.currentSalePrice.toString()).toBe("8.5");
    expect(data.currentPurchasePrice).toBeInstanceOf(Prisma.Decimal);
    expect(data.minQuantity.toString()).toBe("0.5");
    expect(data.quantityStep.toString()).toBe("0.25");
  });

  it("updates products through admin service", async () => {
    const { prisma, service } = createService();

    const dto = await service.updateAdminProduct("product-1", {
      sellingPrice: "11.25",
      isAvailableToday: false
    });

    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "product-1" },
        data: expect.objectContaining({
          currentSalePrice: expect.any(Prisma.Decimal),
          isAvailableToday: false
        })
      })
    );
    expect(dto.purchasePrice).toBe("8");
  });
});
