import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { CustomerProfile, SavedAddress, SavedAddressInput } from "@dushanbe-fresh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CatalogService } from "../catalog/catalog.service";
import { mapPublicOrder, publicOrderInclude } from "../public-orders/public-orders.mapper";
import { customerText } from "./customer-address.validation";

@Injectable()
export class CustomerAccountService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CatalogService) private readonly catalog: CatalogService) {}

  async updateName(user: CustomerProfile, value: unknown) {
    const name = customerText(value, 100);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { name } }),
      this.prisma.customer.updateMany({ where: { userId: user.id }, data: { displayName: name } })
    ]);
    return { ...user, name };
  }
  async addresses(userId: string): Promise<SavedAddress[]> {
    const addresses = await this.prisma.customerAddress.findMany({ where: { userId, deletedAt: null }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
    return addresses.map(address => ({ id: address.id, label: ["home", "work"].includes(address.label ?? "") ? address.label as "home" | "work" : "other",
      housingType: address.housingType === "house" ? "house" : "apartment", street: address.street, building: address.building,
      apartment: address.apartment ?? "", entrance: address.entrance ?? "", floor: address.floor ?? "", instructions: address.instructions ?? "",
      latitude: address.latitude, longitude: address.longitude, isDefault: address.isDefault }));
  }
  async saveAddress(user: CustomerProfile, input: SavedAddressInput, id?: string) {
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
      if (id && !await tx.customerAddress.findFirst({ where: { id, userId: user.id, deletedAt: null } })) throw new NotFoundException("Адрес не найден.");
      const count = await tx.customerAddress.count({ where: { userId: user.id, deletedAt: null } });
      if (!id && count >= 20) throw new BadRequestException("Можно сохранить не больше 20 адресов.");
      const isDefault = input.isDefault || count === 0;
      if (isDefault) await tx.customerAddress.updateMany({ where: { userId: user.id, deletedAt: null }, data: { isDefault: false } });
      const data = { ...input, isDefault, housingType: input.housingType ?? "apartment", recipientName: user.name ?? "", phone: user.phone, city: "Душанбе" };
      if (id) {
        const existing = await tx.customerAddress.findUniqueOrThrow({ where: { id } });
        // Keep the existing default unless another address is explicitly chosen as default.
        await tx.customerAddress.update({ where: { id }, data: { ...data, isDefault: isDefault || existing.isDefault } });
      } else await tx.customerAddress.create({ data: { ...data, userId: user.id } });
    });
    return this.addresses(user.id);
  }
  async deleteAddress(userId: string, id: string) {
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const changed = await tx.customerAddress.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date(), isDefault: false } });
      if (!changed.count) throw new NotFoundException("Адрес не найден.");
      if (!await tx.customerAddress.count({ where: { userId, deletedAt: null, isDefault: true } })) {
        const next = await tx.customerAddress.findFirst({ where: { userId, deletedAt: null }, orderBy: { createdAt: "asc" } });
        if (next) await tx.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    return this.addresses(userId);
  }
  async orders(userId: string, before?: string) {
    if (before && (before.length > 100 || !await this.prisma.order.findFirst({ where: { id: before, accountUserId: userId }, select: { id: true } }))) throw new NotFoundException("Заказ не найден.");
    const orders = await this.prisma.order.findMany({ where: { accountUserId: userId },
      ...(before ? { cursor: { id: before }, skip: 1 } : {}), orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 });
    return orders.map(order => ({ id: order.id, orderNumber: order.orderNumber, createdAt: order.createdAt.toISOString(), status: order.status,
      total: (order.totalFinal ?? order.totalEstimated).toFixed(2), publicTrackingToken: order.publicTrackingToken }));
  }
  async order(userId: string, id: string) {
    const order = await this.prisma.order.findFirst({ where: { id, accountUserId: userId }, include: publicOrderInclude });
    if (!order) throw new NotFoundException("Заказ не найден.");
    return mapPublicOrder(order);
  }
  async claim(user: CustomerProfile, token: unknown) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) throw new NotFoundException("Заказ не найден.");
    const order = await this.prisma.order.findUnique({ where: { publicTrackingToken: token }, include: { customer: true } });
    const snapshot = order?.deliveryAddressSnapshot as { phone?: string } | undefined;
    if (!order || (order.accountUserId && order.accountUserId !== user.id) || order.customer?.phoneNormalized !== user.phone || snapshot?.phone !== user.phone) throw new NotFoundException("Заказ не найден.");
    const changed = await this.prisma.order.updateMany({ where: { id: order.id, OR: [{ accountUserId: null }, { accountUserId: user.id }] }, data: { accountUserId: user.id } });
    if (!changed.count) throw new NotFoundException("Заказ не найден.");
    return { ok: true };
  }
  async repeat(userId: string, id: string) {
    const order = await this.prisma.order.findFirst({ where: { id, accountUserId: userId }, include: { items: true } });
    if (!order) throw new NotFoundException("Заказ не найден.");
    const products = await this.catalog.listPublicProducts();
    const items = [];
    const unavailable = [];
    for (const item of order.items) {
      const product = products.find(product => product.id === item.productId);
      if (!product || item.qualityOptionId || item.qualityOptionLabelSnapshot) {
        unavailable.push({ name: item.productNameSnapshot, nameTj: item.productNameTjSnapshot });
      } else items.push({ product, quantity: item.requestedQuantity.toString(), qualityOptionId: item.qualityOptionId });
    }
    return { items, unavailable };
  }
}
