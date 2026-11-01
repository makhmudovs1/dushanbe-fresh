import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PricingBatch, Product } from "@prisma/client";
import type { BulkPricingBatch, BulkPricingPreview, BulkPricingPreviewInput, BulkPricingPreviewItem, PricingSettings } from "@dushanbe-fresh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { calculateSalePrice, defaultMarkup, lockPricing, parseBulkPreview, parseMarkup, parsePricingId, pricingSettingKey } from "./pricing.rules";
import { pricingState } from "./product-pricing";

type Snapshot = ReturnType<typeof pricingState> & { id: string; name: string; categoryId: string; updatedAt: string };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const snapshot = (product: Product): Snapshot => ({ id: product.id, name: product.name, categoryId: product.categoryId, updatedAt: product.updatedAt.toISOString(), ...pricingState(product) });
const snapshots = (value: Prisma.JsonValue) => value as unknown as Snapshot[];
const stale = () => new ConflictException("Цены или выбранные товары изменились. Создайте новый предпросмотр.");
const sameSnapshots = (a: Snapshot[], b: Snapshot[]) => a.length === b.length && a.every((item, index) =>
  (Object.keys(item) as Array<keyof Snapshot>).every(key => item[key] === b[index][key]));

function previewItems(products: Snapshot[], input: BulkPricingPreviewInput): BulkPricingPreviewItem[] {
  return products.map(product => {
    const price = calculateSalePrice(product.purchasePrice, input.markupPercent);
    const status = product.priceMode === "manual" && !input.overwriteManual ? "skipped_manual" : !price ? "missing_purchase" : "change";
    return { id: product.id, name: product.name, categoryId: product.categoryId, purchasePrice: product.purchasePrice,
      currentSalePrice: product.sellingPrice, newSalePrice: price?.toFixed(2) ?? null,
      currentMarkupPercent: product.appliedMarkupPercent, newMarkupPercent: input.markupPercent,
      priceMode: product.priceMode === "auto" ? "auto" : "manual", status };
  });
}

function batchDto(batch: PricingBatch): BulkPricingBatch {
  return { batchId: batch.id, status: batch.status === "undone" ? "undone" : "applied",
    changeCount: snapshots(batch.afterSnapshot ?? []).length, appliedAt: batch.appliedAt!.toISOString(), undoneAt: batch.undoneAt?.toISOString() ?? null };
}

@Injectable()
export class PricingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async settings(): Promise<PricingSettings> {
    return { defaultMarkupPercent: await defaultMarkup(this.prisma) };
  }

  async updateSettings(body: Record<string, unknown>, actorId: string): Promise<PricingSettings> {
    const percent = parseMarkup(body.defaultMarkupPercent);
    return this.prisma.$transaction(async tx => {
      await lockPricing(tx);
      const before = { defaultMarkupPercent: await defaultMarkup(tx) };
      await tx.appSetting.upsert({ where: { key: pricingSettingKey }, create: { key: pricingSettingKey, value: percent }, update: { value: percent } });
      const after = { defaultMarkupPercent: percent };
      await tx.pricingAudit.create({ data: { actorId, action: "default_markup", targetId: pricingSettingKey, before, after } });
      return after;
    });
  }

  async preview(body: Record<string, unknown>, actorId: string): Promise<BulkPricingPreview> {
    const input = parseBulkPreview(body);
    return this.prisma.$transaction(async tx => {
      await lockPricing(tx);
      await this.validateSelection(tx, input);
      const products = await this.selectedProducts(tx, input);
      const before = products.map(snapshot);
      const items = previewItems(before, input);
      const batch = await tx.pricingBatch.create({ data: { createdBy: actorId, input: json(input), snapshot: json(before), expiresAt: new Date(Date.now() + 15 * 60 * 1000) } });
      return { previewId: batch.id, expiresAt: batch.expiresAt.toISOString(), count: items.length,
        changeCount: items.filter(item => item.status === "change").length,
        skippedManualCount: items.filter(item => item.status === "skipped_manual").length,
        missingPurchaseCount: items.filter(item => item.status === "missing_purchase").length, items };
    });
  }

  async apply(body: Record<string, unknown>, actorId: string): Promise<BulkPricingBatch> {
    const id = parsePricingId(body.previewId), requestId = parsePricingId(body.requestId);
    return this.prisma.$transaction(async tx => {
      await lockPricing(tx);
      const batch = await this.findBatch(tx, id);
      const reused = await tx.pricingBatch.findUnique({ where: { applyRequestId: requestId } });
      if (reused && reused.id !== id) throw new ConflictException("Идентификатор запроса уже использован.");
      if (batch.createdBy !== actorId) throw new ConflictException("Предпросмотр создан другим администратором.");
      if (batch.applyRequestId === requestId) return batchDto(batch);
      if (batch.status !== "preview") throw new ConflictException("Предпросмотр уже применён.");
      if (batch.expiresAt.getTime() <= Date.now()) throw stale();
      const input = batch.input as unknown as BulkPricingPreviewInput;
      const products = await this.selectedProducts(tx, input);
      await this.lockProducts(tx, products.map(product => product.id));
      const current = (await this.selectedProducts(tx, input)).map(snapshot);
      if (!sameSnapshots(current, snapshots(batch.snapshot))) throw stale();
      const before = snapshots(batch.snapshot);
      const items = previewItems(before, input).filter(item => item.status === "change");
      if (!items.length) throw new BadRequestException("Нет товаров для изменения цены.");
      const after: Snapshot[] = [];
      for (const item of items) {
        const old = before.find(product => product.id === item.id)!;
        const updated = await this.writeProduct(tx, old, { currentSalePrice: item.newSalePrice!, priceMode: "auto", markupPercent: input.markupPercent, appliedMarkupPercent: input.markupPercent }, actorId);
        after.push(snapshot(updated));
      }
      const last = await this.lastBatch(tx);
      const updated = await tx.pricingBatch.update({ where: { id }, data: { status: "applied", applyRequestId: requestId,
        appliedAt: new Date(Math.max(Date.now(), (last?.appliedAt?.getTime() ?? 0) + 1)), afterSnapshot: json(after) } });
      await tx.pricingAudit.create({ data: { actorId, action: "bulk_apply", targetId: id, before: batch.snapshot as Prisma.InputJsonValue, after: json(after) } });
      return batchDto(updated);
    }, { timeout: 30000 });
  }

  async last(): Promise<BulkPricingBatch | null> {
    const batch = await this.lastBatch(this.prisma);
    return batch ? batchDto(batch) : null;
  }

  async undo(body: Record<string, unknown>, actorId: string): Promise<BulkPricingBatch> {
    const id = parsePricingId(body.batchId), requestId = parsePricingId(body.requestId);
    return this.prisma.$transaction(async tx => {
      await lockPricing(tx);
      const batch = await this.findBatch(tx, id);
      const reused = await tx.pricingBatch.findUnique({ where: { undoRequestId: requestId } });
      if (reused && reused.id !== id) throw new ConflictException("Идентификатор запроса уже использован.");
      if (batch.undoRequestId === requestId) return batchDto(batch);
      if (batch.status !== "applied" || (await this.lastBatch(tx))?.id !== id) throw new ConflictException("Отменить можно только последнюю массовую операцию.");
      const after = snapshots(batch.afterSnapshot!);
      await this.lockProducts(tx, after.map(product => product.id));
      const current = await tx.product.findMany({ where: { id: { in: after.map(product => product.id) }, deletedAt: null }, orderBy: { id: "asc" } });
      if (!sameSnapshots(current.map(snapshot), after)) throw stale();
      const before = snapshots(batch.snapshot);
      const restored: Snapshot[] = [];
      for (const product of after) {
        const old = before.find(item => item.id === product.id)!;
        restored.push(snapshot(await this.writeProduct(tx, product, { currentSalePrice: old.sellingPrice, priceMode: old.priceMode,
          markupPercent: old.markupPercent, appliedMarkupPercent: old.appliedMarkupPercent }, actorId)));
      }
      const updated = await tx.pricingBatch.update({ where: { id }, data: { status: "undone", undoneAt: new Date(), undoRequestId: requestId } });
      await tx.pricingAudit.create({ data: { actorId, action: "bulk_undo", targetId: id, before: json(after), after: json(restored) } });
      return batchDto(updated);
    }, { timeout: 30000 });
  }

  private async writeProduct(tx: Prisma.TransactionClient, before: Snapshot, data: { currentSalePrice: string; priceMode: string; markupPercent: string | null; appliedMarkupPercent: string | null }, actorId: string) {
    const result = await tx.product.updateMany({ where: { id: before.id, updatedAt: new Date(before.updatedAt), deletedAt: null }, data: {
      ...data, updatedAt: new Date(Math.max(Date.now(), new Date(before.updatedAt).getTime() + 1))
    } });
    if (result.count !== 1) throw stale();
    if (!new Prisma.Decimal(before.sellingPrice).equals(data.currentSalePrice)) {
      const last = await tx.productPriceHistory.findFirst({ where: { productId: before.id }, orderBy: { changedAt: "desc" } });
      await tx.productPriceHistory.create({ data: { productId: before.id, oldSalePrice: before.sellingPrice, newSalePrice: data.currentSalePrice,
        changedByUserId: actorId, changedAt: new Date(Math.max(Date.now(), (last?.changedAt.getTime() ?? 0) + 1)) } });
    }
    return tx.product.findUniqueOrThrow({ where: { id: before.id } });
  }

  private lastBatch(tx: Prisma.TransactionClient) {
    return tx.pricingBatch.findFirst({ where: { appliedAt: { not: null } }, orderBy: [{ appliedAt: "desc" }, { id: "desc" }] });
  }

  private async findBatch(tx: Prisma.TransactionClient, id: string) {
    const batch = await tx.pricingBatch.findUnique({ where: { id } });
    if (!batch) throw new NotFoundException("Предпросмотр не найден.");
    return batch;
  }

  private selectedProducts(tx: Prisma.TransactionClient, input: BulkPricingPreviewInput) {
    return tx.product.findMany({ where: { deletedAt: null, category: { deletedAt: null },
      ...(input.selection.ids ? { id: { in: input.selection.ids } } : input.selection.categoryIds ? { categoryId: { in: input.selection.categoryIds } } : {})
    }, orderBy: { id: "asc" } });
  }

  private async validateSelection(tx: Prisma.TransactionClient, input: BulkPricingPreviewInput) {
    if (input.selection.ids) {
      if ((await this.selectedProducts(tx, input)).length !== input.selection.ids.length) throw new BadRequestException("Часть выбранных товаров не найдена или удалена.");
    } else if (input.selection.categoryIds) {
      const count = await tx.category.count({ where: { id: { in: input.selection.categoryIds }, deletedAt: null } });
      if (count !== input.selection.categoryIds.length) throw new BadRequestException("Часть выбранных категорий не найдена или удалена.");
    }
  }

  private async lockProducts(tx: Prisma.TransactionClient, ids: string[]) {
    if (ids.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM products WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
  }
}
