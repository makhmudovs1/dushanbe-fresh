import { PrismaClient } from "@prisma/client";
import { resetOperations } from "../src/operations/operations.dev-data";

const prisma = new PrismaClient();
resetOperations(prisma, process.env, process.argv.includes("--confirm"))
  .then(result => console.log("Operational dev data removed:", result))
  .catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
