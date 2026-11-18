import { PrismaClient } from "@prisma/client";
import { processAccountDeletion } from "../account-deletion/account-deletion-processor";

async function main() {
  const [requestId, policyVersion, mode, approvedFingerprint, ...extra] = process.argv.slice(2);
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(requestId ?? "") || !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(policyVersion ?? "") || extra.length ||
    (mode !== undefined && (mode !== "--apply" || !/^[\da-f]{64}$/.test(approvedFingerprint ?? "")))) {
    throw new Error("Usage: process-account-deletion <request-id> <policy-version> [--apply <reviewed-fingerprint>]");
  }
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL explicitly in the restricted operator environment.");
  const db = new PrismaClient();
  try {
    const result = await processAccountDeletion(db, { requestId, policyVersion, approvedFingerprint });
    console.log(JSON.stringify(result));
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  // Prisma errors can include SQL/row data. Do not write them to operator logs.
  const expected = error instanceof Error && error.constructor === Error;
  console.error(expected ? error.message : "Deletion did not complete. Review the transaction and regenerate the plan.");
  process.exitCode = 1;
});
