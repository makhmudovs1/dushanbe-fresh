CREATE TABLE "mobile_geocoder_grants" (
  "token_hash" TEXT NOT NULL,
  "identity_hash" TEXT NOT NULL,
  "remaining" INTEGER NOT NULL DEFAULT 30,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mobile_geocoder_grants_pkey" PRIMARY KEY ("token_hash")
);
CREATE INDEX "mobile_geocoder_grants_expires_at_idx" ON "mobile_geocoder_grants"("expires_at");
