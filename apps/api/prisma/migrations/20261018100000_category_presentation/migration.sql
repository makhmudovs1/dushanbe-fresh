ALTER TABLE "categories"
  ADD COLUMN "image_url" TEXT,
  ADD COLUMN "is_visible" BOOLEAN NOT NULL DEFAULT true;
