import { accessSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { applyCategoryIcons, categoryIconSlugs } from "../catalog/category-icons";

const apply = process.argv.includes("--apply");
if (apply && process.env.NODE_ENV === "production" && !process.argv.includes("--production")) throw new Error("Production update requires --apply --production after a verified backup");
for (const slug of categoryIconSlugs) accessSync(resolve(__dirname, "../../../web/public/storefront/icons", `${slug}.webp`));
const db = new PrismaClient();
void applyCategoryIcons(db, apply).then(result => console.log(JSON.stringify(result, null, 2)))
  .catch(error => { console.error(error instanceof Error ? error.message : "Category icon update failed"); process.exitCode = 1; })
  .finally(() => db.$disconnect());
