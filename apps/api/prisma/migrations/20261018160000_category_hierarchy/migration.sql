ALTER TABLE "categories"
  ADD COLUMN "icon_url" TEXT,
  ADD COLUMN "parent_id" TEXT;

CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_no_self_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
