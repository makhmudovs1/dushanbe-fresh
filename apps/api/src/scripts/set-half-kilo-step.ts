import { statSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { setHalfKiloStep } from "../catalog/half-kilo-step";

const apply = process.argv.includes("--apply");
if (apply && process.env.NODE_ENV === "production") {
  const backup = process.env.HALF_KILO_BACKUP_FILE;
  if (!process.argv.includes("--production") || !backup || statSync(backup).size === 0) {
    throw new Error("Production update requires --apply --production and HALF_KILO_BACKUP_FILE after a verified backup");
  }
}
const db = new PrismaClient();
void setHalfKiloStep(db, apply).then(result => console.log(JSON.stringify(result, null, 2)))
  .catch(() => { console.error("Quantity step update failed; inspect the reviewed plan."); process.exitCode = 1; })
  .finally(() => db.$disconnect());
