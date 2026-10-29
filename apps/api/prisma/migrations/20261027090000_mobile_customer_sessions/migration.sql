-- Additive only: no rewrites of users, browser sessions, orders or catalog.
CREATE TABLE "mobile_customer_sessions" (
 "id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "access_token_hash" TEXT NOT NULL,
 "access_expires_at" TIMESTAMP(3) NOT NULL, "expires_at" TIMESTAMP(3) NOT NULL,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revoked_at" TIMESTAMP(3),
 CONSTRAINT "mobile_customer_sessions_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "mobile_customer_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "mobile_customer_sessions_access_token_hash_key" ON "mobile_customer_sessions"("access_token_hash");
CREATE INDEX "mobile_customer_sessions_user_id_idx" ON "mobile_customer_sessions"("user_id");
CREATE INDEX "mobile_customer_sessions_expires_at_idx" ON "mobile_customer_sessions"("expires_at");
CREATE TABLE "mobile_refresh_tokens" (
 "token_hash" TEXT NOT NULL, "session_id" TEXT NOT NULL, "used_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "mobile_refresh_tokens_pkey" PRIMARY KEY ("token_hash"),
 CONSTRAINT "mobile_refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "mobile_customer_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "mobile_refresh_tokens_session_id_idx" ON "mobile_refresh_tokens"("session_id");
CREATE TABLE "mobile_api_limits" ("key" TEXT NOT NULL, "count" INTEGER NOT NULL, "resets_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "mobile_api_limits_pkey" PRIMARY KEY ("key"));
CREATE INDEX "mobile_api_limits_resets_at_idx" ON "mobile_api_limits"("resets_at");
