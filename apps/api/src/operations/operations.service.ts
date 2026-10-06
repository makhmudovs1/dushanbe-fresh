import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { OrderStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { dateFilter, decimal, finalOrderTotal, money, object, orderTransitions, text, transition, waveTransitions } from "./operations.rules";
import { mapOrder, mapWave, orderInclude, waveInclude, Wave } from "./operations.mappers";
import type { StaffUser } from "@dushanbe-fresh/shared";
import { assertAssignment, assertRole, isAdmin, waveScope } from "./operations.access";
import { audit } from "./operations.audit";
import { staffDto, staffSelect } from "../auth/auth.service";
import { refreshDemand } from "./operations.demand";
import { attachConfirmedOrders, defaultAssignments, defaultStaffKeys } from "./operations.defaults";
import { ensureDeliverySlots } from "../delivery-slots/delivery-schedule";
import { DeliveryFinanceService } from "../delivery-finance/delivery-finance.service";
import { readSlot } from "../delivery-slots/delivery-slots.service";

@Injectable()
export class OperationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DeliveryFinanceService) private readonly finance: DeliveryFinanceService) {}

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

  private async currentActor(tx: Prisma.TransactionClient, actor?: StaffUser) {
    if (!actor) return undefined;
    const user = await tx.user.findUnique({ where: { id: actor.id }, select: staffSelect });
    if (!user || user.status !== "active" || !user.roles.length) throw new ForbiddenException("Доступ сотрудника отключён.");
    return staffDto(user);
  }

  private async lockedOrder(tx: Prisma.TransactionClient, id: string, actor?: StaffUser, role?: "picker" | "courier") {
    actor = await this.currentActor(tx, actor);
    const order = await tx.order.findUnique({ where: { id }, include: orderInclude });
    if (!order) throw new NotFoundException("Заказ не найден.");
    await this.lockSlot(tx, order.deliverySlotId);
    assertAssignment(order.deliveryWaveId ? await tx.deliveryWave.findUnique({ where: { id: order.deliveryWaveId } }) : null, actor, role);
    return order;
  }

  private async lockedWave(tx: Prisma.TransactionClient, id: string, actor?: StaffUser, role?: "picker" | "courier") {
    actor = await this.currentActor(tx, actor);
    const wave = await tx.deliveryWave.findUnique({ where: { id }, include: waveInclude });
    if (!wave) throw new NotFoundException("Волна не найдена.");
    await this.lockSlot(tx, wave.deliverySlotId);
    assertAssignment(wave, actor, role);
    return wave;
  }

  async orders(filters: { date?: string; deliverySlotId?: string; status?: string; tab?: string }, actor?: StaffUser) {
    if (filters.status && !Object.keys(orderTransitions).includes(filters.status)) throw new BadRequestException("Неизвестный статус заказа.");
    const tabs: Record<string, OrderStatus[]> = { active: ["pending_review", "confirmed", "picking", "picked", "out_for_delivery"], completed: ["delivered"], cancelled: ["cancelled"] };
    if (filters.tab && !Object.prototype.hasOwnProperty.call(tabs, filters.tab)) throw new BadRequestException("Неизвестная вкладка заказов.");
    const statuses = filters.tab ? tabs[filters.tab].filter(status => !filters.status || status === filters.status) : undefined;
    const orders = await this.prisma.order.findMany({
      where: { ...(!isAdmin(actor) ? { deliveryWave: waveScope(actor) } : {}), deliverySlot: { date: dateFilter(filters.date) }, deliverySlotId: filters.deliverySlotId || undefined,
        status: statuses ? { in: statuses } : filters.status as OrderStatus | undefined }, orderBy: { createdAt: "desc" }, include: orderInclude
    });
    return orders.map(mapOrder);
  }

  async order(id: string, actor?: StaffUser) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!order) throw new NotFoundException("Заказ не найден.");
    if (!isAdmin(actor)) assertAssignment(order.deliveryWaveId ? await this.prisma.deliveryWave.findUnique({ where: { id: order.deliveryWaveId } }) : null, actor);
    return mapOrder(order);
  }

  async slots(date?: string) {
    await ensureDeliverySlots(this.prisma);
    return this.prisma.deliverySlot.findMany({ where: { date: dateFilter(date) },
      orderBy: [{ date: "desc" }, { startsAt: "asc" }], include: { wave: { select: { id: true, status: true } } } });
  }

  async waves(date?: string, actor?: StaffUser, tab?: string) {
    const tabs: Record<string, string[]> = { upcoming: ["open"], working: ["picking"], completed: ["picked", "out_for_delivery", "delivered", "cancelled"] };
    if (tab && !Object.prototype.hasOwnProperty.call(tabs, tab)) throw new BadRequestException("Неизвестная вкладка волн.");
    const pickerOnly = actor?.roles.includes("picker") && !actor.roles.includes("courier") && !isAdmin(actor);
    const selected = tab ?? (pickerOnly ? "upcoming" : undefined);
    const waves = await this.prisma.deliveryWave.findMany({ where: { ...waveScope(actor), deliverySlot: { date: dateFilter(date) }, ...(selected ? { status: { in: tabs[selected] } } : {}) },
      include: waveInclude, orderBy: pickerOnly && selected !== "completed"
        ? [{ deliverySlot: { date: "asc" } }, { deliverySlot: { startsAt: "asc" } }]
        : { createdAt: "desc" } });
    const threshold = await this.purchaseThreshold();
    return waves.map(wave => mapWave(wave, threshold));
  }

  async wave(id: string, actor?: StaffUser) {
    const wave = await this.prisma.deliveryWave.findUnique({ where: { id }, include: waveInclude });
    if (!wave) throw new NotFoundException("Волна не найдена.");
    assertAssignment(wave, actor);
    return mapWave(wave, await this.purchaseThreshold());
  }

  private async purchaseThreshold() {
    const setting = await this.prisma.appSetting.findUnique({ where: { key: "purchase_price_deviation_percent" } });
    return decimal(setting?.value ?? "15", 2, "Порог отклонения закупочной цены");
  }

  async updatePurchaseThreshold(value: unknown) {
    const threshold = decimal(object(value).value, 2, "Порог отклонения закупочной цены");
    if (threshold.gt(100)) throw new BadRequestException("Порог должен быть от 0 до 100%.");
    return this.prisma.appSetting.upsert({ where: { key: "purchase_price_deviation_percent" },
      create: { key: "purchase_price_deviation_percent", value: threshold.toFixed(2) }, update: { value: threshold.toFixed(2) } });
  }

  async updateDefaultStaff(value: unknown, actor?: StaffUser) {
    const body = object(value);
    await this.transaction(async tx => {
      assertRole(await this.currentActor(tx, actor), "admin");
      for (const [field, role] of [["pickerUserId", "picker"], ["courierUserId", "courier"]] as const) {
        if (body[field] === undefined) continue;
        const id = text(body[field], "Дежурный сотрудник", true, 100);
        if (id && !await tx.user.findFirst({ where: { id, roles: { has: role }, status: "active" } })) throw new BadRequestException("Выберите активного сотрудника с подходящей ролью.");
        await tx.appSetting.upsert({ where: { key: `default_${role}_id` }, create: { key: `default_${role}_id`, value: id }, update: { value: id } });
      }
      const defaults = await defaultAssignments(tx);
      // Fill only vacant assignments; never replace an explicit assignment.
      for (const field of ["pickerUserId", "courierUserId"] as const) {
        if (defaults[field]) await tx.deliveryWave.updateMany({ where: { status: { in: ["open", "picking", "picked"] }, [field]: null }, data: { [field]: defaults[field] } });
      }
      await audit(tx, actor, "staff.defaults_changed", "default_staff");
    });
    return this.prisma.appSetting.findMany({ where: { key: { in: defaultStaffKeys } } });
  }

  async formWave(value: unknown) {
    const slotId = text(object(value).deliverySlotId, "Окно доставки", false, 100);
    const id = await this.transaction(async tx => {
      await this.lockSlot(tx, slotId);
      let wave = await tx.deliveryWave.findUnique({ where: { deliverySlotId: slotId } });
      if (wave && wave.status !== "open") return wave.id;
      const count = await tx.order.count({ where: { deliverySlotId: slotId, status: "confirmed", deliveryWaveId: null } });
      if (!count && !wave) throw new ConflictException("В этом окне доставки пока нет подтверждённых заказов.");
      wave = await attachConfirmedOrders(tx, slotId);
      return wave.id;
    });
    return this.wave(id);
  }

  async updateOrderStatus(id: string, value: unknown, actor?: StaffUser) {
    const status = text(object(value).status, "Статус") as OrderStatus;
    if (!isAdmin(actor) && !["picking", "picked", "delivered"].includes(status)) throw new ForbiddenException("Недостаточно прав.");
    await this.transaction(async tx => {
      const order = await this.lockedOrder(tx, id, actor, status === "delivered" ? "courier" : "picker");
      if (!isAdmin(await this.currentActor(tx, actor)) && !["picking", "picked", "delivered"].includes(status)) throw new ForbiddenException("Недостаточно прав.");
      transition(order.status, status, orderTransitions);
      if (status === order.status) return;
      if (status === "cancelled" && order.status === "out_for_delivery") throw new ConflictException("Заказ уже у курьера. Оформите проблему при доставке вместо отмены.");
      if (order.paymentStatus === "paid" && status === "cancelled") throw new ConflictException("Оплаченный заказ нельзя отменить без возврата.");
      const wave = order.deliveryWaveId ? await tx.deliveryWave.findUnique({ where: { id: order.deliveryWaveId } }) : null;
      if (wave && ["delivered", "cancelled"].includes(wave.status)) throw new ConflictException("Волна завершена.");
      if (status === "picking" && wave?.status !== "picking") throw new ConflictException("Сначала начните сборку волны.");
      if (status === "picked" && (wave?.status !== "picking" || order.totalFinal === null)) throw new ConflictException("Сначала распределите все товары заказа.");
      if (status === "out_for_delivery" && (wave?.status !== "out_for_delivery" || !wave.courierUserId)) throw new ConflictException("Сначала отправьте волну с назначенным курьером.");
      if (status === "confirmed" && order.status === "pending_review") {
        const slot = await readSlot(tx, order.deliverySlotId);
        // Pending orders already reserve capacity, but cannot join an expired or started slot.
        if (!slot || slot.unavailableReasons.some(reason => reason !== "capacity_full")) throw new ConflictException("Приём в этом окне закрыт. Сначала перенесите заказ в доступное окно.");
      }
      await tx.order.update({ where: { id }, data: { status } });
      await audit(tx, actor, `order.${status}`, id);
      if (status === "confirmed" && !order.deliveryWaveId) await attachConfirmedOrders(tx, order.deliverySlotId);
      if (status === "cancelled" && order.deliveryWaveId) await refreshDemand(tx, order.deliveryWaveId);
      if (wave?.status === "out_for_delivery" && ["delivered", "cancelled"].includes(status)) {
        const remaining = await tx.order.count({ where: { deliveryWaveId: wave.id, status: { notIn: ["delivered", "cancelled"] } } });
        if (!remaining) {
          const delivered = await tx.order.count({ where: { deliveryWaveId: wave.id, status: "delivered" } });
          await tx.deliveryWave.update({ where: { id: wave.id }, data: { status: delivered ? "delivered" : "cancelled" } });
          await audit(tx, actor, delivered ? "wave.delivered" : "wave.cancelled", wave.id);
        }
      }
    });
    return this.order(id, actor);
  }

  async markPaid(id: string, actor?: StaffUser, note?: string) {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id }, include: { deliveryWave: true } });
    if (!actor && order.deliveryWave?.courierUserId) actor = staffDto(await this.prisma.user.findUniqueOrThrow({ where: { id: order.deliveryWave.courierUserId }, select: staffSelect }));
    if (!actor) throw new ForbiddenException("Нужен назначенный курьер.");
    const current = await this.finance.get(id, actor);
    if (order.status !== "delivered" || order.paymentMethod !== "cash_on_delivery") throw new ConflictException("Сначала отметьте доставку.");
    if (!current.collectionReported) await this.finance.collect(id, { requestId: `legacy-paid:${id}`, version: current.version, mode: "full", note: note ?? "" }, actor);
    return this.order(id, actor);
  }

  async assign(id: string, value: unknown, actor?: StaffUser) {
    const body = object(value);
    await this.transaction(async tx => {
      assertRole(await this.currentActor(tx, actor), "admin");
      const wave = await this.lockedWave(tx, id);
      const unpaid = wave.orders.some(order => order.status === "delivered" && order.paymentStatus === "pending");
      if (wave.status === "cancelled" || (wave.status === "delivered" && !unpaid)) throw new ConflictException("Волна завершена.");
      if (wave.status === "delivered" && body.pickerUserId !== undefined) throw new ConflictException("В доставленной волне можно переназначить только курьера для отметки оплаты.");
      const data: Prisma.DeliveryWaveUpdateInput = {};
      for (const [field, role, relation] of [["pickerUserId", "picker", "picker"], ["courierUserId", "courier", "courier"]] as const) {
        if (body[field] === undefined) continue;
        const userId = text(body[field], role, true, 100);
        if (!userId) {
          if (relation === "courier" && (wave.status === "out_for_delivery" || unpaid)) throw new ConflictException("В пути или до отметки оплаты можно заменить курьера, но нельзя оставить волну без курьера.");
          data[relation] = { disconnect: true }; continue;
        }
        const user = await tx.user.findFirst({ where: { id: userId, roles: { has: role }, status: "active" } });
        if (!user) throw new BadRequestException("Выберите активного сотрудника с подходящей ролью.");
        data[relation] = { connect: { id: userId } };
      }
      await tx.deliveryWave.update({ where: { id }, data });
      await audit(tx, actor, "wave.assignments_changed", id);
    });
    return this.wave(id);
  }

  async addReplacementPurchase(id: string, value: unknown, actor?: StaffUser) {
    const productId = text(object(value).productId, "Товар", false, 100);
    await this.transaction(async tx => {
      const wave = await this.lockedWave(tx, id, actor, "picker");
      if (wave.status !== "picking") throw new ConflictException("Добавлять закупку можно только во время сборки.");
      const product = await tx.product.findFirst({ where: { id: productId, isActive: true, isAvailableToday: true } });
      if (!product) throw new BadRequestException("Товар недоступен.");
      await tx.waveItem.upsert({ where: { deliveryWaveId_productId: { deliveryWaveId: id, productId } }, update: {},
        create: { deliveryWaveId: id, productId, productNameSnapshot: product.name, unit: product.unit, requestedQuantityTotal: "0", referencePurchasePrice: product.currentPurchasePrice } });
      await audit(tx, actor, "wave.replacement_added", id);
    });
    return this.wave(id, actor);
  }

  private allocated(wave: Wave, productId: string, exceptItem?: string) {
    return wave.orders.filter(order => order.status !== "cancelled" && order.requiresPicking).flatMap(order => order.items)
      .filter(item => item.id !== exceptItem && (item.replacementProductId ?? item.productId) === productId && ["picked", "replaced"].includes(item.status))
      .reduce((sum, item) => sum.plus(item.finalQuantity ?? 0), new Prisma.Decimal(0));
  }

  async purchase(id: string, itemId: string, value: unknown, actor?: StaffUser) {
    const body = object(value);
    const quantity = decimal(body.purchasedQuantity, 3, "Купленное количество");
    const price = decimal(body.purchaseUnitPrice, 2, "Закупочная цена");
    const note = text(body.supplierNote, "Примечание продавца", true);
    await this.transaction(async tx => {
      const wave = await this.lockedWave(tx, id, actor, "picker");
      if (wave.status !== "picking") throw new ConflictException("Закупку можно изменять только во время сборки.");
      const item = wave.waveItems.find(item => item.id === itemId);
      if (!item) throw new NotFoundException("Товар закупки не найден.");
      if (quantity.lt(this.allocated(wave, item.productId))) throw new ConflictException("Уже распределено больше, чем указано в закупке.");
      await tx.waveItem.update({ where: { id: itemId }, data: { purchasedQuantity: quantity, purchaseUnitPrice: price,
        purchaseTotal: money(quantity.mul(price)), supplierNote: note || null } });
      await audit(tx, actor, "purchase.updated", itemId);
    });
    return this.wave(id, actor);
  }

  async distribute(id: string, itemId: string, value: unknown, actor?: StaffUser) {
    const body = object(value);
    if (!isAdmin(actor) && body.finalUnitPrice !== undefined) throw new ForbiddenException("Сборщик не может изменять цену клиенту.");
    const status = text(body.status, "Статус позиции");
    if (!["picked", "replaced", "removed", "unavailable"].includes(status)) throw new BadRequestException("Выберите результат сборки позиции.");
    await this.transaction(async tx => {
      const order = await this.lockedOrder(tx, id, actor, "picker");
      if (!isAdmin(await this.currentActor(tx, actor)) && body.finalUnitPrice !== undefined) throw new ForbiddenException("Сборщик не может изменять цену клиенту.");
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
      await audit(tx, actor, "packing.item_updated", itemId);
    });
    return this.order(id, actor);
  }

  async packOrder(id: string, actor?: StaffUser) {
    await this.transaction(async tx => {
      const order = await this.lockedOrder(tx, id, actor, "picker");
      if (!order.deliveryWaveId || order.status !== "picking") throw new ConflictException("Заказ должен находиться в сборке.");
      const wave = await tx.deliveryWave.findUniqueOrThrow({ where: { id: order.deliveryWaveId }, include: waveInclude });
      if (wave.status !== "picking") throw new ConflictException("Сборка волны уже завершена.");
      const pending = order.items.filter(item => item.status === "requested");
      const planned = new Map<string, Prisma.Decimal>();
      // Reserve all pending lines together, including duplicate products with different quality preferences.
      for (const item of pending) {
        if (item.finalQuantity !== null) throw new ConflictException("Проверьте незавершённое изменение позиции.");
        const quantity = (planned.get(item.productId) ?? this.allocated(wave, item.productId)).plus(item.requestedQuantity);
        const purchase = wave.waveItems.find(row => row.productId === item.productId);
        if (!purchase || purchase.purchasedQuantity === null || purchase.unit !== item.unit || quantity.gt(purchase.purchasedQuantity)) {
          throw new ConflictException(`Недостаточно закупленного товара «${item.productNameSnapshot}». Сохраните закупку или измените позицию заказа.`);
        }
        planned.set(item.productId, quantity);
      }
      for (const item of pending) {
        await tx.orderItem.update({ where: { id: item.id }, data: {
          status: "picked", finalQuantity: item.requestedQuantity, finalUnitPrice: item.saleUnitPriceSnapshot,
          finalTotal: money(item.requestedQuantity.mul(item.saleUnitPriceSnapshot))
        } });
      }
      const items = await tx.orderItem.findMany({ where: { orderId: id } });
      await tx.order.update({ where: { id }, data: { totalFinal: finalOrderTotal(items, order) } });
      if (pending.length) await audit(tx, actor, "order.packed", id);
    });
    return this.order(id, actor);
  }

  async waveStatus(id: string, value: unknown, actor?: StaffUser) {
    if (!isAdmin(actor) && !["picking", "picked", "out_for_delivery"].includes(String(object(value).status))) throw new ForbiddenException("Недостаточно прав.");
    const status = text(object(value).status, "Статус волны");
    await this.transaction(async tx => {
      const wave = await this.lockedWave(tx, id, actor, status === "out_for_delivery" ? "courier" : "picker");
      if (!isAdmin(await this.currentActor(tx, actor)) && !["picking", "picked", "out_for_delivery"].includes(status)) throw new ForbiddenException("Недостаточно прав.");
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
        if (status === "picking" && !order.requiresPicking) continue;
        transition(order.status, status, orderTransitions);
        if (status === "cancelled" && order.paymentStatus === "paid") throw new ConflictException("В волне есть оплаченный заказ.");
      }
      await tx.order.updateMany({ where: { deliveryWaveId: id, status: { not: "cancelled" }, ...(status === "picking" ? { requiresPicking: true } : {}) }, data: { status: status as OrderStatus } });
      await tx.deliveryWave.update({ where: { id }, data: { status } });
      await audit(tx, actor, `wave.${status}`, id);
      if (status === "cancelled") await refreshDemand(tx, id);
    });
    return this.wave(id, actor);
  }
}
