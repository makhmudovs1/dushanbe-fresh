import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
const prisma = new PrismaClient();
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("This seed is for local development only");
  for (const [role, name] of [["admin", "Администратор (тест)"], ["picker", "Сборщик (тест)"], ["courier", "Курьер (тест)"]] as const) {
    const email = `${role}@dushanbefresh.local`;
    const password = process.env[`DEV_${role.toUpperCase()}_PASSWORD`] ?? `Dev-${role}-only-2026!`;
    if (password.length < 12 || Buffer.byteLength(password) > 72) throw new Error("Staff seed passwords must be 12+ characters and at most 72 UTF-8 bytes");
    const existing = await prisma.user.findFirst({ where: { OR: [{ id: `dev-${role}` }, { email }] } });
    if (existing?.passwordHash) continue;
    const passwordHash = await hash(password, 12);
    if (existing) await prisma.user.update({ where: { id: existing.id }, data: { email, passwordHash } });
    else await prisma.user.create({ data: { id: `dev-${role}`, email, passwordHash, name, role } });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
