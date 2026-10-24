import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { catalogImage } from "../catalog/catalog.image";
import { assertCartBound, assertLegacyCartCompatible, cartKey, CartLine, CartSnapshot, isLegacyLine, mergeCartItems, parseCartItems, shoppingId } from "./customer-shopping.validation";

@Injectable()
export class CustomerShoppingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async favoriteIds(tx: Prisma.TransactionClient, userId: string) {
    const rows = await tx.customerFavorite.findMany({ where: { userId }, orderBy: [{ createdAt: "asc" }, { productId: "asc" }], select: { productId: true } });
    return { ids: rows.map(row => row.productId) };
  }

  favorites(userId: string) { return this.favoriteIds(this.prisma, userId); }

  async setFavorite(userId: string, productId: string, active: boolean) {
    shoppingId(productId);
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, userId);
      const where = { userId_productId: { userId, productId } };
      if (!active) await tx.customerFavorite.deleteMany({ where: { userId, productId } });
      else if (!await tx.customerFavorite.findUnique({ where })) {
        if (!await tx.product.findFirst({ where: { id: productId, deletedAt: null }, select: { id: true } })) throw new NotFoundException("Товар не найден.");
        if (await tx.customerFavorite.count({ where: { userId } }) >= 500) throw new BadRequestException("Можно сохранить не больше 500 товаров в избранном.");
        await tx.customerFavorite.create({ data: { userId, productId } });
      }
      return this.favoriteIds(tx, userId);
    });
  }

  private async lock(tx: Prisma.TransactionClient, userId: string) {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  }

  private async saved(tx: Prisma.TransactionClient, userId: string): Promise<CartSnapshot> {
    const cart = await tx.customerCart.findUnique({ where: { userId } });
    return cart ? { revision: cart.revision, items: parseCartItems(cart.items) } : { revision: 0, items: [] };
  }

  // Catalog metadata is authoritative, but observed prices and legacy snapshots are not repriced.
  private async canonical(tx: Prisma.TransactionClient, items: CartLine[], saved: CartLine[] = []): Promise<CartLine[]> {
    const products = await tx.product.findMany({ where: { id: { in: items.filter(item => !isLegacyLine(item)).map(item => item.productId) } },
      select: { id: true, slug: true, name: true, nameTj: true, imageUrl: true, unit: true, isWeighted: true, minQuantity: true, quantityStep: true,
        deletedAt: true, isActive: true, isAvailableToday: true, category: { select: { isActive: true, deletedAt: true } },
        images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { id: "asc" }], take: 1, select: { url: true } } } });
    const byId = new Map(products.map(product => [product.id, product]));
    const previous = new Map(saved.map(item => [cartKey(item), item]));
    return items.map(item => {
      const old = previous.get(cartKey(item));
      // A legacy line can only be removed, not silently converted or edited by a cart save.
      if (old && isLegacyLine(old)) return old;
      if (isLegacyLine(item)) return item;
      const product = byId.get(item.productId);
      const line = { ...item, sellingPrice: old?.sellingPrice ?? item.sellingPrice };
      if (!product) return { ...(old ?? line), slug: "", imageUrl: null, status: "unavailable" };
      return { ...line, slug: product.deletedAt ? "" : product.slug, name: product.name, nameTj: product.nameTj,
        imageUrl: product.deletedAt ? null : catalogImage(product.images[0]?.url ?? product.imageUrl), unit: product.unit, isWeighted: product.isWeighted,
        minQuantity: product.minQuantity.toString(), quantityStep: product.quantityStep.toString(),
        ...(product.deletedAt || !product.isActive || !product.isAvailableToday || !product.category.isActive || product.category.deletedAt ? { status: "unavailable" as const } : {}) };
    });
  }

  async cart(userId: string): Promise<CartSnapshot> {
    return this.prisma.$transaction(async tx => {
      const saved = await this.saved(tx, userId);
      return { revision: saved.revision, items: await this.canonical(tx, saved.items) };
    });
  }

  private async persist(tx: Prisma.TransactionClient, userId: string, revision: number, items: CartLine[]) {
    if (revision >= 2147483647) throw new BadRequestException("Не удалось сохранить корзину. Обновите страницу и попробуйте снова.");
    assertCartBound(items);
    const next = revision + 1;
    await tx.customerCart.upsert({ where: { userId }, create: { userId, revision: next, items: items as Prisma.InputJsonValue },
      update: { revision: next, items: items as Prisma.InputJsonValue } });
    return { revision: next, items };
  }

  async replaceCart(userId: string, input: CartSnapshot): Promise<CartSnapshot> {
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, userId);
      const saved = await this.saved(tx, userId);
      if (saved.revision !== input.revision) throw new ConflictException({ revision: saved.revision, items: await this.canonical(tx, saved.items) });
      assertLegacyCartCompatible({ revision: saved.revision, items: await this.canonical(tx, saved.items) }, input.items);
      const items = await this.canonical(tx, input.items, saved.items);
      return this.persist(tx, userId, saved.revision, items);
    });
  }

  async importCart(userId: string, input: { sourceId: string; items: CartLine[] }): Promise<CartSnapshot> {
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, userId);
      const saved = await this.saved(tx, userId);
      const existing = await tx.customerCartImport.findUnique({ where: { userId_sourceId: { userId, sourceId: input.sourceId } } });
      if (existing) return { revision: saved.revision, items: await this.canonical(tx, saved.items) };
      const currentCart = { revision: saved.revision, items: await this.canonical(tx, saved.items) };
      const items = await this.canonical(tx, mergeCartItems(currentCart, input.items), saved.items);
      const result = await this.persist(tx, userId, saved.revision, items);
      await tx.customerCartImport.create({ data: { userId, sourceId: input.sourceId } });
      return result;
    });
  }
}
