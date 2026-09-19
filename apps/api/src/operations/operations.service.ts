import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { OrderStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { aggregateDemand, dateFilter, decimal, finalOrderTotal, money, object, orderTransitions, text, transition, waveTransitions } from "./operations.rules";
import { mapOrder, mapWave, orderInclude, waveInclude, Wave } from "./operations.mappers";
import type { StaffUser } from "@dushanbe-fresh/shared";
import { assertAssignment, waveScope } from "./operations.access";

@Injectable()
export class OperationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async transaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await this.prisma.$transaction(run, { isolationLevel: "Serializable", timeout: 15000 }); }
      catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) {
          if (attempt < 2) continue;
          throw new ConflictException("Данные изменились. Обновите страницу и повторите действие.");
        }
        throw error;
      }
    }
    throw new ConflictException("Повторите действие.");
  }

  private async lockSlot(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM delivery_slots WHERE id = ${id} FOR UPDATE`;
    if (!rows.length) throw new NotFoundException("Окно доставки не найдено.");
  }

  private async lockedOrder(tx: Prisma.TransactionClient, id: string, actor?: StaffUser) {
    const order = await tx.order.findUnique({ where: { id }, include: orderInclude });
    if (!order) throw new NotFoundException("Заказ не найден.");
    await this.lockSlot(tx, order.deliverySlotId);
    if (actor && actor.role !== "admin") assertAssignment(order.deliveryWaveId ? await tx.deliveryWave.findUnique({ where: { id: order.deliveryWaveId } }) : null, actor);
    return order;
  }

  private async lockedWave(tx: Prisma.TransactionClient, id: string, actor?: StaffUser) {
    const wave = await tx.deliveryWave.findUnique({ where: { id }, include: waveInclude });
    if (!wave) throw new NotFoundException("Волна не найдена.");
    await this.lockSlot(tx, wave.deliverySlotId);
    assertAssignment(wave, actor);
    return wave;
  }

  async orders(filters: { date?: string; deliverySlotId?: string; status?: string }, actor?: StaffUser) {
    if (filters.status && !Object.keys(orderTransitions).includes(filters.status)) throw new BadRequestException("Неизвестный статус заказа.");
    const orders = await this.prisma.order.findMany({
      where: { ...(actor && actor.role !== "admin" ? { deliveryWave: waveScope(actor) } : {}), deliverySlot: { date: dateFilter(filters.date) }, deliverySlotId: filters.deliverySlotId || undefined,
        status: filters.status as OrderStatus | undefined }, orderBy: { createdAt: "desc" }, include: orderInclude
    });
    return orders.map(mapOrder);
  }

  async order(id: string, actor?: StaffUser) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!order) throw new NotFoundException("Заказ не найден.");
    if (actor && actor.role !== "admin") assertAssignment(order.deliveryWaveId ? await this.prisma.deliveryWave.findUnique({ where: { id: order.deliveryWaveId } }) : null, actor);
    return mapOrder(order);
  }

  async slots(date?: string) {
    return this.prisma.deliverySlot.findMany({ where: { date: dateFilter(date) },
      orderBy: [{ date: "desc" }, { startsAt: "asc" }], include: { wave: { select: { id: true, status: true } } } });
  }

  staff() { return this.prisma.user.findMany({ where: { role: { in: ["picker", "courier"] }, status: "active" },
    select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }); }

  async waves(date?: string, actor?: StaffUser) {
    const waves = await this.prisma.deliveryWave.findMany({ where: { ...waveScope(actor), deliverySlot: { date: dateFilter(date) } },
      include: waveInclude, orderBy: { createdAt: "desc" } });
    return waves.map(mapWave);
  }

  async wave(id: string, actor?: StaffUser) {
    const wave = await this.prisma.deliveryWave.findUnique({ where: { id }, include: waveInclude });
    if (!wave) throw new NotFoundException("Волна не найдена.");
    assertAssignment(wave, actor);
    return mapWave(wave);
  }

  private async refreshDemand(tx: Prisma.TransactionClient, id: string) {
    const orders = await tx.order.findMany({ where: { deliveryWaveId: id, status: { not: "cancelled" } }, include: { items: true } });
    const groups = aggregateDemand(orders.flatMap(order => order.items));
    // Preserve procurement history even when an order is cancelled or a product is no longer requested.
    await tx.waveItem.updateMany({ where: { deliveryWaveId: id }, data: { requestedQuantityTotal: "0" } });
    for (const group of groups) {
      await tx.waveItem.upsert({ where: { deliveryWaveId_productId: { deliveryWaveId: id, productId: group.productId } },
        update: { requestedQuantityTotal: group.quantity }, create: { deliveryWaveId: id, productId: group.productId,
          requestedQuantityTotal: group.quantity, productNameSnapshot: group.name, unit: group.unit } });
    }
  }

  async formWave(value: unknown) {
    const slotId = text(object(value).deliverySlotId, "Окно доставки", false, 100);
    const id = await this.transaction(async tx => {
      await this.lockSlot(tx, slotId);
      let wave = await tx.deliveryWave.findUnique({ where: { deliverySlotId: slotId } });
      if (wave && wave.status !== "open") return wave.id;
      const count = await tx.order.count({ where: { deliverySlotId: slotId, status: "confirmed", deliveryWaveId: null } });
      if (!count && !wave) throw new ConflictException("Сначала подтвердите заказы этого окна доставки.");
      wave ??= await tx.deliveryWave.create({ data: { deliverySlotId: slotId } });
      await tx.order.updateMany({ where: { deliverySlotId: slotId, status: "confirmed", deliveryWaveId: null }, data: { deliveryWaveId: wave.id } });
      await this.refreshDemand(tx, wave.id);
      return wave.id;
    });
    return this.wave(id);
  }

  async updateOrderStatus(id: string, value: unknown, actor?: StaffUser) {
    const status = text(object(value).status, "Статус") as OrderStatus;
    await this.transaction(async tx => {
      const order = await this.lockedOrder(tx, id, actor);
      transition(order.status, status, orderTransitions);
      if (status === order.status) return;
      if (order.paymentStatus === "paid" && status === "cancelled") throw new ConflictException("Оплаченный заказ нельзя отменить без возврата.");
      const wave = order.deliveryWaveId ? await tx.deliveryWave.findUnique({ where: { id: order.deliveryWaveId } }) : null;
      if (wave && ["delivered", "cancelled"].includes(wave.status)) throw new ConflictException("Волна завершена.");
      if (status === "picking" && wave?.status !== "picking") throw new ConflictException("Сначала начните сборку волны.");
      if (status === "picked" && (wave?.status !== "picking" || order.totalFinal === null)) throw new ConflictException("Сначала распределите все товары заказа.");
      if (status === "out_for_delivery" && (wave?.status !== "out_for_delivery" || !wave.courierUserId)) throw new ConflictException("Сначала отправьте волну с назначенным курьером.");
      await tx.order.update({ where: { id }, data: { status } });
      if (status === "cancelled" && order.deliveryWaveId) await this.refreshDemand(tx, order.deliveryWaveId);
    });
    return this.order(id, actor);
  }

  async markPaid(id: string, actor?: StaffUser) {
    await this.transaction(async tx => {
      const order = await this.lockedOrder(tx, id, actor);
      if (order.status !== "delivered" || order.paymentMethod !== "cash_on_delivery" || order.totalFinal === null) {
        throw new ConflictException("Наличные отмечаются после доставки и расчёта итоговой суммы.");
      }
      if (!["pending", "paid"].includes(order.paymentStatus)) throw new ConflictException("Проверьте состояние оплаты.");
      await tx.order.update({ where: { id }, data: { paymentStatus: "paid" } });
    });
    return this.order(id, actor);
  }

  async assign(id: string, value: unknown) {
    const body = object(value);
    await this.transaction(async tx => {
      const wave = await this.lockedWave(tx, id);
      if (["out_for_delivery", "delivered", "cancelled"].includes(wave.status)) throw new ConflictException("Назначения этой волны уже зафиксированы.");
      const data: Prisma.DeliveryWaveUpdateInput = {};
      for (const [field, role, relation] of [["pickerUserId", "picker", "picker"], ["courierUserId", "courier", "courier"]] as const) {
        if (body[field] === undefined) continue;
        const userId = text(body[field], role, true, 100);
        if (!userId) { data[relation] = { disconnect: true }; continue; }
        const user = await tx.user.findFirst({ where: { id: userId, role, status: "active" } });
        if (!user) throw new BadRequestException("Выберите активного сотрудника с подходящей ролью.");
        data[relation] = { connect: { id: userId } };
      }
      await tx.deliveryWave.update({ where: { id }, data });
    });
    return this.wave(id);
  }

  async addReplacementPurchase(id: string, value: unknown, actor?: StaffUser) {
    const productId = text(object(value).productId, "Товар", false, 100);
    await this.transaction(async tx => {
      const wave = await this.lockedWave(tx, id, actor);
      if (wave.status !== "picking") throw new ConflictException("Добавлять закупку можно только во время сборки.");
      const product = await tx.product.findFirst({ where: { id: productId, isActive: true, isAvailableToday: true } });
      if (!product) throw new BadRequestException("Товар недоступен.");
      await tx.waveItem.upsert({ where: { deliveryWaveId_productId: { deliveryWaveId: id, productId } }, update: {},
        create: { deliveryWaveId: id, productId, productNameSnapshot: product.name, unit: product.unit, requestedQuantityTotal: "0" } });
    });
    return this.wave(id, actor);
  }

  private allocated(wave: Wave, productId: string, exceptItem?: string) {
    return wave.orders.filter(order => order.status !== "cancelled").flatMap(order => order.items)
      .filter(item => item.id !== exceptItem && (item.replacementProductId ?? item.productId) === productId && ["picked", "replaced"].includes(item.status))
      .reduce((sum, item) => sum.plus(item.finalQuantity ?? 0), new Prisma.Decimal(0));
  }

  async purchase(id: string, itemId: string, value: unknown, actor?: StaffUser) {
    const body = object(value);
    const quantity = decimal(body.purchasedQuantity, 3, "Купленное количество");
    const price = decimal(body.purchaseUnitPrice, 2, "Закупочная цена");
    const note = text(body.supplierNote, "Примечание продавца", true);
    await this.transaction(async tx => {
      const wave = await this.lockedWave(tx, id, actor);
      if (wave.status !== "picking") throw new ConflictException("Закупку можно изменять только во время сборки.");
      const item = wave.waveItems.find(item => item.id === itemId);
      if (!item) throw new NotFoundException("Товар закупки не найден.");
      if (quantity.lt(this.allocated(wave, item.productId))) throw new ConflictException("Уже распределено больше, чем указано в закупке.");
      await tx.waveItem.update({ where: { id: itemId }, data: { purchasedQuantity: quantity, purchaseUnitPrice: price,
        purchaseTotal: money(quantity.mul(price)), supplierNote: note || null } });
    });
    return this.wave(id, actor);
  }

  async distribute(id: string, itemId: string, value: unknown, actor?: StaffUser) {
    const body = object(value);
    const status = text(body.status, "Статус позиции");
    if (!["picked", "replaced", "removed", "unavailable"].includes(status)) throw new BadRequestException("Выберите результат сборки позиции.");
    await this.transaction(async tx => {
      const order = await this.lockedOrder(tx, id, actor);
      if (!order.deliveryWaveId || order.status !== "picking") throw new ConflictException("Заказ должен находиться в сборке.");
      const wave = await tx.deliveryWave.findUniqueOrThrow({ where: { id: order.deliveryWaveId }, include: waveInclude });
      if (wave.status !== "picking") throw new ConflictException("Сборка волны уже завершена.");
      const item = order.items.find(item => item.id === itemId);
      if (!item) throw new NotFoundException("Позиция не найдена.");
      const note = text(body.pickerNote, "Примечание сборщика", true);
      const excluded = ["removed", "unavailable"].includes(status);
      const quantity = excluded ? new Prisma.Decimal(0) : decimal(body.finalQuantity, 3, "Фактическое количество");
      const price = body.finalUnitPrice === undefined || body.finalUnitPrice === "" ? item.saleUnitPriceSnapshot : decimal(body.finalUnitPrice, 2, "Цена клиенту");
      if (!excluded && quantity.lte(0)) throw new BadRequestException("Для собранного товара укажите положительное количество.");
      if (!price.eq(item.saleUnitPriceSnapshot) && !note) throw new BadRequestException("Укажите причину изменения цены клиенту в примечании.");
      let replacementProductId: string | null = null;
      if (status === "replaced") {
        if (order.substitutionPolicy === "remove_item") throw new ConflictException("Клиент запретил замену товара.");
        if (order.substitutionPolicy === "contact_me" && !note) throw new BadRequestException("Зафиксируйте согласование замены с клиентом.");
        replacementProductId = text(body.replacementProductId, "Товар замены", false, 100);
        const replacement = await tx.product.findFirst({ where: { id: replacementProductId, isActive: true } });
        if (!replacement || replacement.id === item.productId || replacement.unit !== item.unit) throw new BadRequestException("Выберите другой товар с той же единицей измерения.");
      }
      if (!excluded) {
        const actualProductId = replacementProductId ?? item.productId;
        const purchase = wave.waveItems.find(row => row.productId === actualProductId);
        if (!purchase || purchase.purchasedQuantity === null || purchase.unit !== item.unit || this.allocated(wave, actualProductId, item.id).plus(quantity).gt(purchase.purchasedQuantity)) {
          throw new ConflictException("Недостаточно закупленного количества. Сначала сохраните закупку.");
        }
      }
      await tx.orderItem.update({ where: { id: itemId }, data: {
        status: status as "picked" | "replaced" | "removed" | "unavailable", finalQuantity: quantity, finalUnitPrice: price,
        finalTotal: money(quantity.mul(price)), pickerNote: note || null, replacementProductId
      } });
      const items = await tx.orderItem.findMany({ where: { orderId: id } });
      await tx.order.update({ where: { id }, data: { totalFinal: finalOrderTotal(items, order) } });
    });
    return this.order(id, actor);
  }

  async waveStatus(id: string, value: unknown, actor?: StaffUser) {
    const status = text(object(value).status, "Статус волны");
    await this.transaction(async tx => {
      const wave = await this.lockedWave(tx, id, actor);
      transition(wave.status, status, waveTransitions);
      if (wave.status === status) return;
      const active = wave.orders.filter(order => order.status !== "cancelled");
      if (!active.length && status !== "cancelled") throw new ConflictException("В волне нет активных заказов.");
      if (status === "picking") {
        const unassigned = await tx.order.count({ where: { deliverySlotId: wave.deliverySlotId, status: { in: ["placed", "confirmed"] }, deliveryWaveId: null } });
        if (unassigned) throw new ConflictException("Подтвердите оставшиеся заказы и сформируйте волну повторно, либо отмените их.");
        if (!wave.pickerUserId) throw new ConflictException("Назначьте сборщика.");
      }
      if (status === "picked" && (active.some(order => order.totalFinal === null) || wave.waveItems.some(item => item.purchaseTotal === null))) {
        throw new ConflictException("Заполните закупку и фактические данные всех позиций.");
      }
      if (status === "out_for_delivery" && !wave.courierUserId) throw new ConflictException("Назначьте курьера.");
      for (const order of active) {
        transition(order.status, status, orderTransitions);
        if (status === "cancelled" && order.paymentStatus === "paid") throw new ConflictException("В волне есть оплаченный заказ.");
      }
      await tx.order.updateMany({ where: { deliveryWaveId: id, status: { not: "cancelled" } }, data: { status: status as OrderStatus } });
      await tx.deliveryWave.update({ where: { id }, data: { status } });
      if (status === "cancelled") await this.refreshDemand(tx, id);
    });
    return this.wave(id, actor);
  }
}
