import { describe, expect, it, vi } from "vitest";
import { CustomerAccountService } from "./customer-account.service";
import { PrismaService } from "../prisma/prisma.service";
import { CatalogService } from "../catalog/catalog.service";

function setup() {
  const prisma = { user: { update: vi.fn() }, customer: { updateMany: vi.fn() }, $transaction: vi.fn().mockResolvedValue([]) };
  const service = new CustomerAccountService(prisma as unknown as PrismaService, {} as CatalogService);
  const user = { id: "customer", name: null, phone: "+992900000001", phoneVerifiedAt: new Date(0).toISOString() };
  return { prisma, service, user };
}
describe("compatible customer name parts", () => {
  it("saves both parts and the display name atomically without changing identity", async () => {
    const { prisma, service, user } = setup();
    expect(await service.updateProfile(user, { firstName: " Ситора ", lastName: " Алиева " })).toMatchObject({ id: user.id, name: "Ситора Алиева", firstName: "Ситора", lastName: "Алиева" });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: user.id }, data: { name: "Ситора Алиева", firstName: "Ситора", lastName: "Алиева" } });
    expect(prisma.customer.updateMany).toHaveBeenCalledWith({ where: { userId: user.id }, data: { displayName: "Ситора Алиева" } });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
  it.each([{ firstName: "Ситора" }, { firstName: "", lastName: "Алиева" }, { firstName: "Ситора", lastName: " " }, { firstName: "x".repeat(51), lastName: "Алиева" }, { firstName: "x".repeat(50), lastName: "y".repeat(50) }, { firstName: "Ситора", lastName: "Алиева", name: "conflicting" }])("rejects incomplete or ambiguous structured input", async body => {
    const { prisma, service, user } = setup();
    await expect(service.updateProfile(user, body)).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("keeps old native name-only updates readable and clears stale structured parts", async () => {
    const { service, user } = setup();
    expect(await service.updateProfile(user, { name: "Прежний клиент" })).toMatchObject({ name: "Прежний клиент", firstName: null, lastName: null });
  });
  it("preserves exact multiword name parts when an older client saves the unchanged display name", async () => {
    const { service, user } = setup();
    const current = { ...user, name: "Муҳаммад Али Саидов", firstName: "Муҳаммад Али", lastName: "Саидов" };
    expect(await service.updateProfile(current, { name: current.name })).toMatchObject(current);
    expect(await service.updateProfile(current, { name: "Другое имя" })).toMatchObject({ name: "Другое имя", firstName: null, lastName: null });
  });
});
