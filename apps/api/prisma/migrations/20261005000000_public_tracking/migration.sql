-- Independent cryptographic UUID pairs also cover old rows and non-checkout creation paths.
ALTER TABLE "orders" ADD COLUMN "public_tracking_token" TEXT NOT NULL
DEFAULT (replace(gen_random_uuid()::text, '-'::text, ''::text) || replace(gen_random_uuid()::text, '-'::text, ''::text));
CREATE UNIQUE INDEX "orders_public_tracking_token_key" ON "orders"("public_tracking_token");
