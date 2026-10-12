import { PrismaClient } from "@prisma/client";
import { fillCatalogDescriptions } from "../catalog/catalog.descriptions";

const apply = process.argv.includes("--apply");
if (apply && process.env.NODE_ENV === "production" && !process.argv.includes("--production")) throw new Error("Production update requires --apply --production after a verified backup");
const db = new PrismaClient();
void fillCatalogDescriptions(db, apply).then(result => console.log(JSON.stringify(result, null, 2)))
  .catch(error => { console.error(error instanceof Error ? error.message : "Description update failed"); process.exitCode = 1; })
  .finally(() => db.$disconnect());
