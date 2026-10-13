import { PrismaClient } from "@prisma/client";
import { backfillProductImages } from "../catalog/catalog.backfill";

const prisma = new PrismaClient();
async function main() {
  try { console.log(`Добавлено фотографий: ${await backfillProductImages(prisma)}`); }
  finally { await prisma.$disconnect(); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Ошибка backfill."); process.exitCode = 1; });
