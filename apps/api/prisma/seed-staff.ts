import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { assertLocalDevelopment } from "../src/operations/operations.dev-data";
const prisma = new PrismaClient();
async function main() {
  assertLocalDevelopment(process.env);
  for (const [role, name] of [["admin", "Администратор (тест)"], ["picker", "Сборщик (тест)"], ["courier", "Курьер (тест)"]] as const) {
    const email = `${role}@dushanbefresh.local`;
    const password = process.env[`DEV_${role.toUpperCase()}_PASSWORD`] ?? `Dev-${role}-only-2026!`;
    if (password.length < 12 || Buffer.byteLength(password) > 72) throw new Error("Staff seed passwords must be 12+ characters and at most 72 UTF-8 bytes");
    const existing = await prisma.user.findFirst({ where: { OR: [{ id: `dev-${role}` }, { email }] } });
    let user = existing;
    if (!existing?.passwordHash) {
      const passwordHash = await hash(password, 12);
      user = existing ? await prisma.user.update({ where: { id: existing.id }, data: { email, passwordHash } })
        : await prisma.user.create({ data: { id: `dev-${role}`, email, passwordHash, name, role } });
    }
    if (role !== "admin" && user?.role === role && user.status === "active") {
      await prisma.appSetting.upsert({ where: { key: `default_${role}_id` }, update: {}, create: { key: `default_${role}_id`, value: user.id } });
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
