import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { importPilotCatalog, parsePilotCatalog } from "../catalog/pilot-import";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
if (apply && process.env.NODE_ENV === "production" && !args.includes("--production")) throw new Error("Production import requires --apply --production after a verified database backup");
const path = args.find(arg => !arg.startsWith("--")) ?? resolve("prisma/data/pilot_catalog_canonical.json");
const data = parsePilotCatalog(JSON.parse(readFileSync(path, "utf8")));
const db = new PrismaClient();
void importPilotCatalog(db, data, apply).then(result => console.log(JSON.stringify(result, null, 2)))
  .catch(error => { console.error(error instanceof Error ? error.message : "Pilot import failed"); process.exitCode = 1; })
  .finally(() => db.$disconnect());
