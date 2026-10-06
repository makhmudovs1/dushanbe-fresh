import { BadRequestException } from "@nestjs/common";
import type { CheckoutInput, CreateOrderInput, SubstitutionPolicy } from "@dushanbe-fresh/shared";
import { normalizePhone } from "../customers/phone";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("Некорректные данные заказа.");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max = 150, optional = false): string {
  if (optional && (value === undefined || value === null || value === "")) return "";
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new BadRequestException(`Проверьте поле «${label}».`);
  }
  return value.trim();
}

export function parseCheckout(value: unknown): CheckoutInput {
  const body = record(value);
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
    throw new BadRequestException("В заказе должно быть от 1 до 100 позиций.");
  }
  const keys = new Set<string>();
  const items = body.items.map((value) => {
    const item = record(value);
    const productId = text(item.productId, "Товар", 100);
    const qualityOptionId = text(item.qualityOptionId, "Предпочтение", 100, true) || null;
    const quantity = text(item.quantity, "Количество", 12);
    if (!/^\d{1,6}(\.\d{1,3})?$/.test(quantity) || /^0+(\.0+)?$/.test(quantity)) {
      throw new BadRequestException("Количество должно быть положительным числом, до трёх знаков после точки.");
    }
    const key = `${productId}:${qualityOptionId ?? ""}`;
    if (keys.has(key)) throw new BadRequestException("Объедините повторяющиеся позиции корзины.");
    keys.add(key);
    const observedPrice = item.observedPrice;
    if (observedPrice !== undefined && (typeof observedPrice !== "string" || !/^\d{1,10}(\.\d{1,2})?$/.test(observedPrice))) {
      throw new BadRequestException("Некорректный формат цены.");
    }
    return { productId, qualityOptionId, quantity, observedPrice: observedPrice as string | undefined };
  });
  return { items, deliverySlotId: text(body.deliverySlotId, "Окно доставки", 100) };
}

export function parseCreateOrder(value: unknown): CreateOrderInput {
  const body = record(value);
  const checkout = parseCheckout(body);
  const address = record(body.address);
  const phone = normalizePhone(text(body.phone, "Телефон", 32));
  const policies = ["replace_similar", "contact_me", "remove_item"];
  if (!policies.includes(String(body.substitutionPolicy))) throw new BadRequestException("Выберите правило замены товара.");
  const reviewToken = text(body.reviewToken, "Подтверждение суммы", 64);
  const requestId = text(body.requestId, "Номер отправки", 36);
  if (!/^[a-f0-9]{64}$/.test(reviewToken) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId)) {
    throw new BadRequestException("Проверьте заказ ещё раз перед отправкой.");
  }
  return {
    ...checkout, phone, name: text(body.name, "Имя", 100), reviewToken, requestId,
    substitutionPolicy: body.substitutionPolicy as SubstitutionPolicy,
    address: {
      street: text(address.street, "Улица"), building: text(address.building, "Дом", 30),
      apartment: text(address.apartment, "Квартира", 30, true),
      entrance: text(address.entrance, "Подъезд", 30, true),
      floor: text(address.floor, "Этаж", 30, true),
      instructions: text(address.instructions, "Комментарий курьеру", 500, true)
    }
  };
}
