CREATE TABLE "customer_account_deletion_requests" (
  "id" TEXT NOT NULL,
  "user_id" TEXT,
  "policy_version" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'requested',
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "customer_account_deletion_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_account_deletion_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "customer_account_deletion_requests_user_id_key" ON "customer_account_deletion_requests"("user_id");
CREATE INDEX "customer_account_deletion_requests_status_requested_at_idx" ON "customer_account_deletion_requests"("status", "requested_at");
