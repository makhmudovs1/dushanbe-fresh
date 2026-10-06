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
  imageUrl: "/api/v1/media/00000000-0000-4000-8000-000000000001.webp",
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
      findUnique: vi.fn().mockResolvedValue(product),
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
  it("requires a photo for new enabled products but permits drafts", async () => {
    const { prisma, service } = createService();
    const input = { categoryId: category.id, name: "Зелень", slug: "greens", unit: "bunch", sellingPrice: "2.50", purchasePrice: "1.50", minQuantity: "1", quantityStep: "1", image: null };
    await expect(service.createAdminProduct(input)).rejects.toThrow("Добавьте фотографию");
    expect(prisma.product.create).not.toHaveBeenCalled();
    await service.createAdminProduct({ ...input, isActive: false });
    expect(prisma.product.create).toHaveBeenCalledOnce();
  });

  it("requires a photo when editing a legacy enabled product, including price-only updates", async () => {
    const { prisma, service } = createService();
    prisma.product.findUnique.mockResolvedValue({ ...product, imageUrl: null } as never);
    await expect(service.updateAdminProduct(product.id, { sellingPrice: "12" })).rejects.toThrow("Добавьте фотографию");
    await expect(service.updateAdminProduct(product.id, { isAvailableToday: true })).rejects.toThrow("Добавьте фотографию");
    await service.updateAdminProduct(product.id, { isActive: false });
  });

  it("rejects clearing an enabled photo and does not allow base64 in drafts", async () => {
    const { service } = createService();
    await expect(service.updateAdminProduct(product.id, { image: null })).rejects.toThrow("Добавьте фотографию");
    await expect(service.updateAdminProduct(product.id, { isActive: false, image: "data:image/png;base64,AAAA" })).rejects.toThrow("HTTPS");
  });

  it("treats nonexistent old seed paths as missing photos", async () => {
    const { prisma, service } = createService();
    const legacy = { ...product, imageUrl: "/img/products/tomatoes.jpg" };
    prisma.product.findUnique.mockResolvedValue(legacy);
    prisma.product.findMany.mockResolvedValue([legacy]);
    expect((await service.listPublicProducts())[0].image).toBeNull();
    await expect(service.updateAdminProduct(product.id, { sellingPrice: "12" })).rejects.toThrow("Добавьте фотографию");
  });

  it("replaces the persisted image without changing the public image contract", async () => {
    const { prisma, service } = createService();
    const image = "/api/v1/media/00000000-0000-4000-8000-000000000001.webp";
    prisma.product.update.mockResolvedValue({ ...product, imageUrl: image });
    const result = await service.updateAdminProduct(product.id, { image });
    expect(prisma.product.update).toHaveBeenCalledWith(expect.objectContaining({ data: { imageUrl: image } }));
    expect(result.image).toBe(image);
  });

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
    expect(dto.image).toBe(product.imageUrl);
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
      image: "/api/v1/media/00000000-0000-4000-8000-000000000002.webp",
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
