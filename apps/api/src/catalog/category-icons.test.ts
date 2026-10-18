import { describe, expect, it } from "vitest";
import { applyCategoryIcons, categoryIconPlan, categoryIconSlugs } from "./category-icons";
import { PrismaClient } from "@prisma/client";

describe("initial category icons", () => {
  it("plans only supplied existing categories without overwriting uploaded icons", () => {
    const rows = [{ id: "1", slug: "vegetables", iconUrl: null }, { id: "2", slug: "fruits", iconUrl: "/api/v1/media/custom.webp" }, { id: "3", slug: "unknown", iconUrl: null }];
    expect(categoryIconPlan(rows)).toEqual([{ ...rows[0], nextIcon: "/storefront/icons/vegetables.webp" }]);
    expect(rows[0].iconUrl).toBeNull();
  });
  it("is idempotent after icons are assigned", () => {
    expect(categoryIconPlan([{ id: "1", slug: "greens", iconUrl: "/storefront/icons/greens.webp" }])).toEqual([]);
  });
});

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("category icon assignment integration", () => {
  it("changes only an empty icon and preserves photo, names, sorting and flags", async () => {
    if (!url!.includes("test") || !["localhost", "127.0.0.1"].includes(new URL(url!).hostname)) throw new Error("Dedicated local test database required");
    const db = new PrismaClient({ datasources: { db: { url } } });
    const saved = await db.category.findMany({ where: { slug: { in: [...categoryIconSlugs] }, deletedAt: null } });
    const before = saved.filter(category => category.slug === "vegetables");
    try {
      const dry = await applyCategoryIcons(db);
      expect(dry.updated).toBe(0);
      expect(await db.category.findMany({ where: { slug: "vegetables", deletedAt: null } })).toEqual(before);
      await applyCategoryIcons(db, true);
      for (const row of before) {
        const after = await db.category.findUniqueOrThrow({ where: { id: row.id } });
        expect({ ...after, iconUrl: row.iconUrl }).toEqual(row);
        if (row.iconUrl) expect(after.iconUrl).toBe(row.iconUrl);
        else expect(after.iconUrl).toBe("/storefront/icons/vegetables.webp");
      }
      expect((await applyCategoryIcons(db, true)).updated).toBe(0);
    } finally {
      // Only undo the five icon fields touched by this test, not unrelated catalog data.
      for (const row of saved) await db.category.update({ where: { id: row.id }, data: { iconUrl: row.iconUrl } });
      await db.$disconnect();
    }
  });
});
