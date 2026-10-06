BEGIN;
CREATE TYPE "StaffRole" AS ENUM ('admin', 'picker', 'courier');
ALTER TABLE "users" ADD COLUMN "roles" "StaffRole"[] NOT NULL DEFAULT ARRAY[]::"StaffRole"[];
UPDATE "users" SET "roles" = ARRAY["role"::text::"StaffRole"]
WHERE "role"::text IN ('admin', 'picker', 'courier');

CREATE TABLE "operational_audit" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operational_audit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operational_audit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "operational_audit_entity_id_created_at_idx" ON "operational_audit"("entity_id", "created_at");
COMMIT;
