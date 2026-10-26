import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ConflictException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CheckoutInput, CheckoutLine, CheckoutQuote, CreateOrderInput, OrderReceipt } from "@dushanbe-fresh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { readSlot, slotDto } from "../delivery-slots/delivery-slots.service";
import { slotUnavailableLabels } from "@dushanbe-fresh/shared";
import { attachConfirmedOrders } from "../operations/operations.defaults";
import { normalizePhone } from "../customers/phone";
import { checkDeliveryZone, DELIVERY_ZONE_KEY, deliveryZoneMessages } from "@dushanbe-fresh/shared";
import { deliveryZoneFromSetting } from "../delivery-zone/delivery-zone.service";

const D = Prisma.Decimal;
const maxMoney = new D("9999999999.99");
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

@Injectable()
export class CheckoutService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  validate(input: CheckoutInput) {
    return this.prisma.$transaction(tx => this.quote(tx, input), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead
    });
  }

  private async quote(tx: Prisma.TransactionClient, input: CheckoutInput): Promise<CheckoutQuote> {
    const products = await tx.product.findMany({
      where: { id: { in: input.items.map(item => item.productId) } },
      include: { category: true, qualityOptions: { where: { isActive: true } } }
    });
    const settings = await tx.appSetting.findMany({
      where: { key: { in: ["minimum_order_amount", "delivery_fee", "service_fee", "service_fee_percent", DELIVERY_ZONE_KEY] } }
    });
    function setting(key: string) {
      const value = settings.find(setting => setting.key === key)?.value;
      if (typeof value !== "string" || !/^\d{1,10}(\.\d{1,2})?$/.test(value)) {
        throw new ServiceUnavailableException("Оформление временно недоступно. Попробуйте позже.");
      }
      return new D(value);
    }
    const minimum = setting("minimum_order_amount");
    const deliveryFee = setting("delivery_fee");
    let serviceFee = setting("service_fee");
    const rateValue = settings.find(setting => setting.key === "service_fee_percent")?.value ?? "0";
    if (typeof rateValue !== "string" || !/^\d{1,3}(\.\d{1,2})?$/.test(rateValue) || new D(rateValue).gt(100)) throw new ServiceUnavailableException("Проверьте настройку сервисного сбора.");
    const rate = new D(rateValue);
    let subtotal = new D(0);
    const items: CheckoutLine[] = input.items.map(item => {
      const product = products.find(product => product.id === item.productId);
      const errors: string[] = [];
      const warnings: string[] = [];
      const quantity = new D(item.quantity);
      const quality = product?.qualityOptions.find(option => option.id === item.qualityOptionId);
      if (!product || !product.isActive || !product.isAvailableToday || !product.category.isActive) {
        errors.push(product ? `${product.name} сегодня больше недоступны.` : "Товар больше недоступен.");
      }
      if (product) {
        if (product.minQuantity.lte(0) || product.quantityStep.lte(0) || quantity.lt(product.minQuantity) ||
            (product.quantityStep.gt(0) && !quantity.minus(product.minQuantity).mod(product.quantityStep).isZero())) {
          errors.push(`Проверьте количество: минимум ${product.minQuantity}, шаг ${product.quantityStep}.`);
        }
        if (product.currentSalePrice.lt(0)) errors.push("Цена товара временно недоступна.");
        if (item.qualityOptionId) errors.push("В корзине осталось старое предпочтение. Удалите позицию и выберите конкретный товар заново.");
        if (item.observedPrice !== undefined && !product.currentSalePrice.eq(item.observedPrice)) {
          warnings.push(`Цена «${product.name}» изменилась с ${item.observedPrice} до ${product.currentSalePrice.toFixed(2)} сомони за единицу.`);
        }
      }
      const lineTotal = product ? product.currentSalePrice.mul(quantity).toDecimalPlaces(2, D.ROUND_HALF_UP) : new D(0);
      if (lineTotal.gt(maxMoney)) errors.push("Слишком большая сумма позиции. Уменьшите количество.");
      if (!errors.length) subtotal = subtotal.plus(lineTotal);
      return {
        productId: item.productId, name: product?.name ?? "Недоступный товар", unit: product?.unit ?? "",
        nameTj: product?.nameTj ?? null,
        isWeighted: product?.isWeighted ?? false, sellingPrice: product?.currentSalePrice.toFixed(2) ?? null,
        requestedQuantity: quantity.toString(), estimatedTotal: errors.length ? "0.00" : lineTotal.toFixed(2),
        qualityOption: quality ? { id: quality.id, label: quality.label, labelTj: quality.labelTj } : null, errors, warnings
      };
    });
    const deliverySlot = await readSlot(tx, input.deliverySlotId);
    const errors: string[] = [];
    const zone = deliveryZoneFromSetting(settings.find(setting => setting.key === DELIVERY_ZONE_KEY)?.value);
    const zoneResult = checkDeliveryZone(zone, input.address ?? {});
    if (zoneResult !== "allowed") errors.push(deliveryZoneMessages[zoneResult]);
    if (!deliverySlot) errors.push("Окно доставки не найдено. Выберите другое время.");
    else errors.push(...deliverySlot.unavailableReasons.map(reason => slotUnavailableLabels[reason]));
    const shortfall = D.max(0, minimum.minus(subtotal));
    if (shortfall.gt(0)) errors.push(`До минимального заказа не хватает ${shortfall.toFixed(2)} сомони.`);
    if (rate.gt(0)) serviceFee = subtotal.mul(rate).div(100).toDecimalPlaces(2, D.ROUND_HALF_UP);
    const total = subtotal.plus(deliveryFee).plus(serviceFee);
    if (total.gt(maxMoney)) errors.push("Сумма заказа слишком велика.");
    const values = {
      itemsSubtotal: subtotal.toFixed(2), deliveryFee: deliveryFee.toFixed(2), serviceFee: serviceFee.toFixed(2),
      totalEstimated: total.toFixed(2), minimumOrderAmount: minimum.toFixed(2), minimumOrderShortfall: shortfall.toFixed(2),
      serviceFeePercentSnapshot: rate.gt(0) ? rate.toFixed(2) : null
    };
    // A fingerprint of the reviewed server values, not a client-supplied price.
    // Capacity is rechecked independently and does not invalidate an otherwise identical quote.
    const reviewToken = hash({
      items: items.map(item => ({ ...item, warnings: [] })), ...values,
      ...(zone.enabled ? { deliveryZone: zone, point: { latitude: input.address?.latitude, longitude: input.address?.longitude } } : {}),
      slot: deliverySlot && { id: deliverySlot.id, date: deliverySlot.date, startsAt: deliverySlot.startsAt, endsAt: deliverySlot.endsAt }
    });
    return { valid: !errors.length && items.every(item => !item.errors.length), items,
      deliverySlot, ...values, errors, reviewToken };
  }

  async createOrder(input: CreateOrderInput, accountUserId?: string): Promise<OrderReceipt> {
    input = { ...input, phone: normalizePhone(input.phone) };
    const requestHash = hash(input);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          const existing = await tx.order.findUnique({
            where: { checkoutRequestId: input.requestId }, include: { deliverySlot: true }
          });
          if (existing) {
            if (existing.checkoutRequestHash !== requestHash || (existing.accountUserId ?? undefined) !== accountUserId) throw new ConflictException("Эта отправка уже использована. Проверьте заказ ещё раз.");
            return this.receipt(existing);
          }
          // Serialize bookings of the same slot. Serializable retries refresh the snapshot
          // after a competing transaction commits, so both cannot take the last place.
          await tx.$queryRaw`SELECT id FROM delivery_slots WHERE id = ${input.deliverySlotId} FOR UPDATE`;
          const quote = await this.quote(tx, input);
          if (!quote.valid || input.reviewToken !== quote.reviewToken) {
            throw new ConflictException({ message: "Заказ изменился. Проверьте актуальные данные и подтвердите ещё раз.", quote });
          }
          const customer = await tx.customer.upsert({
            where: { phoneNormalized: input.phone }, update: { displayName: input.name },
            create: { phoneNormalized: input.phone, displayName: input.name }
          });
          if (accountUserId) {
            const updated = await tx.user.updateMany({ where: { id: accountUserId, phone: input.phone, phoneVerifiedAt: { not: null }, status: "active", role: "customer", roles: { isEmpty: true } }, data: { name: input.name } });
            if (!updated.count) throw new UnauthorizedException("Войдите по номеру телефона.");
          }
          const needsReview = !customer.isActive || customer.codPolicy !== "allowed" || customer.riskStatus === "restricted";
          const address = { ...input.address, city: "Душанбе", recipientName: input.name, phone: input.phone };
          const order = await tx.order.create({
            data: {
              orderNumber: `DF-${randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`,
              publicTrackingToken: randomBytes(32).toString("hex"),
              checkoutRequestId: input.requestId, checkoutRequestHash: requestHash,
              customerId: customer.id, accountUserId, deliveryAddressSnapshot: address, deliverySlotId: input.deliverySlotId,
              substitutionPolicy: input.substitutionPolicy, status: needsReview ? "pending_review" : "confirmed",
              paymentMethod: "cash_on_delivery", paymentStatus: "pending",
              itemsSubtotal: new D(quote.itemsSubtotal), deliveryFee: new D(quote.deliveryFee),
              serviceFee: new D(quote.serviceFee), serviceFeePercentSnapshot: quote.serviceFeePercentSnapshot, totalEstimated: new D(quote.totalEstimated), totalFinal: null,
              items: { create: quote.items.map(item => ({
                productId: item.productId, productNameSnapshot: item.name, unit: item.unit,
                productNameTjSnapshot: item.nameTj,
                requestedQuantity: new D(item.requestedQuantity), saleUnitPriceSnapshot: new D(item.sellingPrice!),
                estimatedTotal: new D(item.estimatedTotal), qualityOptionId: item.qualityOption?.id ?? null,
                qualityOptionLabelSnapshot: item.qualityOption?.label ?? null,
                finalQuantity: null, finalTotal: null, status: "requested"
              })) }
            }, include: { deliverySlot: true }
          });
          if (!needsReview) await attachConfirmedOrders(tx, input.deliverySlotId);
          return this.receipt(order);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) {
          if (attempt < 2) continue;
          throw new ConflictException("Не удалось подтвердить заказ. Повторите отправку.");
        }
        throw error;
      }
    }
    throw new ConflictException("Повторите отправку заказа.");
  }

  private receipt(order: Prisma.OrderGetPayload<{ include: { deliverySlot: true } }>): OrderReceipt {
    return {
      orderNumber: order.orderNumber, deliverySlot: slotDto(order.deliverySlot, 0),
      publicTrackingToken: order.publicTrackingToken,
      address: order.deliveryAddressSnapshot as OrderReceipt["address"],
      totalEstimated: order.totalEstimated.toFixed(2), paymentMethod: "cash_on_delivery", paymentStatus: "pending",
      requiresConfirmation: order.status === "pending_review"
    };
  }
}
