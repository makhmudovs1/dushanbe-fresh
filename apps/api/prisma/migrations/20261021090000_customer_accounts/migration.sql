ALTER TABLE "users" ADD COLUMN "phone_verified_at" TIMESTAMP(3);
ALTER TABLE "customers" ADD COLUMN "user_id" TEXT;
CREATE UNIQUE INDEX "customers_user_id_key" ON "customers"("user_id");
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD COLUMN "account_user_id" TEXT;
CREATE INDEX "orders_account_user_id_created_at_idx" ON "orders"("account_user_id", "created_at");
ALTER TABLE "orders" ADD CONSTRAINT "orders_account_user_id_fkey" FOREIGN KEY ("account_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_addresses" ADD COLUMN "housing_type" TEXT NOT NULL DEFAULT 'apartment', ADD COLUMN "latitude" DOUBLE PRECISION, ADD COLUMN "longitude" DOUBLE PRECISION, ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_address_coordinates" CHECK (("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180));
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_address_housing" CHECK ("housing_type" IN ('apartment', 'house'));
CREATE TABLE "customer_sessions" (
  "id" TEXT NOT NULL PRIMARY KEY, "user_id" TEXT NOT NULL, "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revoked_at" TIMESTAMP(3),
  CONSTRAINT "customer_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "customer_sessions_token_hash_key" ON "customer_sessions"("token_hash");
CREATE INDEX "customer_sessions_user_id_idx" ON "customer_sessions"("user_id");
CREATE INDEX "customer_sessions_expires_at_idx" ON "customer_sessions"("expires_at");
CREATE TABLE "customer_otp_challenges" (
  "id" TEXT NOT NULL PRIMARY KEY, "phone" TEXT NOT NULL, "code_hash" TEXT NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "sent_at" TIMESTAMP(3), "consumed_at" TIMESTAMP(3)
);
CREATE INDEX "customer_otp_challenges_phone_created_at_idx" ON "customer_otp_challenges"("phone", "created_at");
CREATE INDEX "customer_otp_challenges_expires_at_idx" ON "customer_otp_challenges"("expires_at");
CREATE TABLE "customer_auth_limits" ("key" TEXT NOT NULL PRIMARY KEY, "count" INTEGER NOT NULL, "resets_at" TIMESTAMP(3) NOT NULL);
CREATE INDEX "customer_auth_limits_resets_at_idx" ON "customer_auth_limits"("resets_at");
